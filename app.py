# app.py
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify 
from models.Authuser import AuthUser
from models.file_handler import allowed_file, extract_text_from_file
from models.context import ChatContext
import os
from dotenv import load_dotenv
import google.generativeai as genai
import uuid
from rag_qa import load_rag_system, rag_pipeline
import json
import traceback


load_dotenv()  # Load environment variables

app = Flask(__name__)

app.secret_key = os.getenv('SECRET_KEY') or 'dev-secret-key'

AuthUser.init_db()
ChatContext.init_db()

gemini_api_key = os.getenv('GEMINI_API_KEY')
if gemini_api_key:
    genai.configure(api_key=gemini_api_key)
    model = genai.GenerativeModel('gemini-2.5-flash-preview-04-17')
else:
    print("Warning: GEMINI_API_KEY not found in environment variables")
    model = None

# Configure file uploads
app.config['UPLOAD_FOLDER'] = 'uploads'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)


# Load RAG system components once at startup
model_path = "ai_integration/t5-small-pubmedqa"
index_path = "ai_integration/pubmedqa_faiss.index"
context_map_path = "ai_integration/context_map.pkl"

# Initialize RAG system
print("Loading RAG system components...")
try:
    rag_model, rag_tokenizer, embedding_model, index, context_map = load_rag_system(
        model_path, index_path, context_map_path
    )
    print("RAG system loaded successfully!")
    rag_system_loaded = True
except Exception as e:
    print(f"Failed to load RAG system: {e}")
    traceback.print_exc()
    rag_system_loaded = False

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        
        user = AuthUser.login(email, password)
        if user:
            session['user_id'] = user['id']
            session['email'] = user['email']
            # Clear any previous guest session
            if 'guest' in session:
                session.pop('guest')
            if 'session_id' in session:
                session.pop('session_id')
            return redirect(url_for('chat'))
        else:
            flash('Invalid credentials', 'error')
    
    return render_template('login.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        
        if AuthUser.signup(email, password):
            flash('Account created successfully! Please login.', 'success')
            return redirect(url_for('login'))
        else:
            flash('Email already exists', 'error')
    
    return render_template('signup.html')

@app.route('/change-password', methods=['GET', 'POST'])
def change_password():
    if request.method == 'POST':
        email = request.form['email']
        new_password = request.form['new_password']
        confirm_password = request.form['confirm_password']
        
        # Verify email exists
        user = AuthUser.get_user_by_email(email)
        if not user:
            flash('No account found with that email', 'error')
            return redirect(url_for('change_password'))
        
        if new_password != confirm_password:
            flash('New passwords do not match', 'error')
        elif len(new_password) < 8:
            flash('Password must be at least 8 characters', 'error')
        else:
            if AuthUser.update_password(user['id'], new_password):
                flash('Your password has been updated successfully! Please login.', 'success')
                return redirect(url_for('login'))
            else:
                flash('Error updating password', 'error')
    
    return render_template('changePassword.html')

@app.route('/chat')
def chat():
    if 'user_id' not in session:
        session['guest'] = True
    return render_template('index.html')

@app.route('/api/chat', methods=['POST'])
def chat_api():
    # Check if user is either guest or logged in
    if 'guest' not in session and 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user_message = request.json.get('message')
    selected_model = request.json.get('model', 'gemini')  # Default to Gemini if not specified
    
    if not user_message:
        return jsonify({'error': 'No message provided'}), 400
    
    # Create session if it doesn't exist (for both guest and logged-in users)
    if 'session_id' not in session:
        if 'guest' in session:
            session['session_id'] = f"guest_{str(uuid.uuid4())[:8]}"
        else:
            # For logged-in users, create a proper session with title
            title = user_message[:30] + '...' if len(user_message) > 30 else user_message
            session['session_id'] = ChatContext.create_session(session['user_id'], title)
    
    # Store user message
    if 'guest' not in session:  # Only store messages for authenticated users
        ChatContext.add_message(session['session_id'], 'user', user_message)
    
    try:
        # Process based on selected model
        if selected_model == 'rag' and rag_system_loaded:
            # Use the RAG model for response generation
            result = process_with_rag_model(user_message)
            ai_response = result['generated_answer']
            context_info = result.get('retrieved_contexts', [])
            
            # Store AI response with model info and context
            if 'guest' not in session:  # Only store messages for authenticated users
                ChatContext.add_message(
                    session['session_id'], 
                    'assistant', 
                    ai_response, 
                    model=selected_model,
                    context_info=json.dumps(context_info)
                )
            
            return jsonify({
                'response': ai_response,
                'isMarkdown': True,
                'context_info': context_info
            })
        elif selected_model == 'gemini':
            # Check if Gemini API is configured
            if model is None:
                error_msg = "Gemini API key not configured. Please check your environment variables."
                print(error_msg)
                return jsonify({'error': error_msg}), 500
            
            # Use Gemini API for response generation
            ai_response = process_with_gemini(user_message)
            
            # Store AI response with model info
            if 'guest' not in session:  # Only store messages for authenticated users
                ChatContext.add_message(
                    session['session_id'], 
                    'assistant', 
                    ai_response, 
                    model='gemini'
                )
            
            return jsonify({
                'response': ai_response,
                'isMarkdown': True
            })
        else:
            error_msg = f"Selected model '{selected_model}' is not available"
            print(error_msg)
            return jsonify({'error': error_msg}), 400
    except Exception as e:
        error_detail = str(e)
        print(f"Error in chat_api: {error_detail}")
        traceback.print_exc()  # Print detailed stack trace
        return jsonify({'error': f"An error occurred: {error_detail}"}), 500

@app.route('/api/chat/sessions', methods=['GET'])
def get_user_sessions():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    sessions = ChatContext.get_user_sessions(session['user_id'])
    return jsonify({'sessions': sessions})

@app.route('/api/chat/session/<session_id>', methods=['GET', 'DELETE', 'POST'])
def manage_session(session_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    if request.method == 'GET':
        messages = ChatContext.get_session_messages(session_id)
        # Verify this session belongs to the current user
        session_info = ChatContext.get_session_info(session_id)
        if not session_info or session_info['user_id'] != session['user_id']:
            return jsonify({'error': 'Unauthorized access to session'}), 403
        
        session['session_id'] = session_id  # Set the active session
        return jsonify({'messages': messages})
    
    elif request.method == 'DELETE':
        success = ChatContext.delete_session(session_id, session['user_id'])
        if success:
            # If deleting the active session, clear it from session
            if session.get('session_id') == session_id:
                session.pop('session_id', None)
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'Session not found or not owned by user'}), 404
    
    elif request.method == 'POST':  # For renaming
        new_title = request.json.get('title')
        if not new_title:
            return jsonify({'error': 'No title provided'}), 400
        
        success = ChatContext.rename_session(session_id, session['user_id'], new_title)
        if success:
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'Failed to rename session'}), 500

@app.route('/api/chat/new', methods=['POST'])
def create_new_session():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    session_id = ChatContext.create_session(session['user_id'])
    session['session_id'] = session_id  # Set the new session as active
    return jsonify({'session_id': session_id})

@app.route('/api/upload', methods=['POST'])
def upload_file():
    # Check if user is either guest or logged in
    if 'guest' not in session and 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'error': 'File type not allowed'}), 400
    
    try:
        extracted_text = extract_text_from_file(file)
        if not extracted_text:
            return jsonify({'error': 'Could not extract text from file'}), 400
            
        # Generate a unique filename
        filename = f"{uuid.uuid4().hex}.txt"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(extracted_text)
            
        return jsonify({
            'filename': file.filename,
            'content': extracted_text[:500] + "..." if len(extracted_text) > 500 else extracted_text,
            'saved_path': filepath
        })
    except Exception as e:
        print(f"Error in upload_file: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    
@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('home'))

@app.route('/api/check-system-status', methods=['GET'])
def check_system_status():
    """Endpoint to check if models are available"""
    status = {
        'rag_system': rag_system_loaded,
        'gemini_api': model is not None
    }
    return jsonify(status)

def process_with_gemini(user_message):
    """Process the user message with Gemini API"""
    try:
        # Guest users don't have chat history context
        if 'guest' in session or 'session_id' not in session:
            prompt = f"""Act as a medical expert. Use markdown formatting in your responses.
            Keep responses concise and focused on general medical information.
            Question: {user_message}
            Answer:"""
        else:
            # Get last 5 messages for context (excluding current message)
            context_messages = ChatContext.get_session_messages(session['session_id'], limit=5)
            
            # Build medical-focused prompt with context
            prompt = """Act as a medical expert. Use markdown formatting in your responses to highlight 
            important information, create headers for sections, and format lists properly. 
            Previous context:\n"""
            
            for msg in context_messages:
                role = "Patient" if msg['role'] == 'user' else "Doctor"
                prompt += f"{role}: {msg['content']}\n"
            
            prompt += f"\nNew question: {user_message}:"
        
        # Generate response
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        print(f"Error in process_with_gemini: {str(e)}")
        traceback.print_exc()
        raise Exception(f"Gemini API error: {str(e)}")

def process_with_rag_model(user_message):
    """Process the user message with the RAG model"""
    try:
        if not rag_system_loaded:
            raise Exception("RAG system is not properly loaded")
        
        # Use the RAG pipeline to generate a response
        result = rag_pipeline(
            user_message, 
            rag_model, 
            rag_tokenizer, 
            embedding_model, 
            index, 
            context_map, 
            top_k=3
        )
        
        # Format the answer with markdown for better presentation
        formatted_answer = f"### Medical Answer\n\n{result['generated_answer']}"
        
        result['generated_answer'] = formatted_answer
        return result
    except Exception as e:
        print(f"Error in process_with_rag_model: {str(e)}")
        traceback.print_exc()
        raise Exception(f"RAG model error: {str(e)}")
    
@app.route('/about')
def about():
    return render_template('about.html')


@app.after_request
def add_security_headers(response):
    # Skip ngrok browser warning
    response.headers['ngrok-skip-browser-warning'] = 'true'
    # Add other security headers as needed
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    return response

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)