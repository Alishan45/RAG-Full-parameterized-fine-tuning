#rag_qa.py
import faiss
import pickle
from transformers import T5ForConditionalGeneration, T5Tokenizer
from sentence_transformers import SentenceTransformer

# ------------------- Load RAG System Components -------------------

def load_rag_system(model_path, index_path, context_map_path):
    """Load the saved RAG system components."""
    tokenizer = T5Tokenizer.from_pretrained(model_path)
    model = T5ForConditionalGeneration.from_pretrained(model_path)
    model.eval()
    
    embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
    index = faiss.read_index(index_path)
    
    with open(context_map_path, 'rb') as f:
        context_map = pickle.load(f)
        
    return model, tokenizer, embedding_model, index, context_map


# ------------------- RAG Core Functions -------------------

def retrieve_context(query, embedding_model, index, context_map, top_k=3):
    """Retrieve the most relevant contexts for a given query."""
    query_embedding = embedding_model.encode([query])
    faiss.normalize_L2(query_embedding)
    distances, indices = index.search(query_embedding, top_k)
    
    retrieved_contexts = []
    retrieved_info = []
    
    for idx in indices[0]:
        idx = int(idx)
        context = context_map[idx]["context"]
        retrieved_contexts.append(context)
        retrieved_info.append({
            "context": context,
            "original_question": context_map[idx]["question"],
            "original_answer": context_map[idx]["answer"],
            "similarity_score": float(1 - distances[0][list(indices[0]).index(idx)])
        })
    
    return retrieved_contexts, retrieved_info


def generate_answer(question, contexts, model, tokenizer):
    """Generate an answer using the fine-tuned T5 model."""
    combined_context = " ".join(contexts)
    input_text = f"question: {question} context: {combined_context}"
    input_ids = tokenizer(input_text, return_tensors="pt", max_length=512, truncation=True).input_ids
    
    outputs = model.generate(
        input_ids=input_ids,
        max_length=512,
        num_beams=4,
        early_stopping=True
    )
    
    answer = tokenizer.decode(outputs[0], skip_special_tokens=True)
    return answer


def rag_pipeline(question, model, tokenizer, embedding_model, index, context_map, top_k=3):
    """Full RAG pipeline: retrieve contexts and generate an answer."""
    contexts, retrieved_info = retrieve_context(question, embedding_model, index, context_map, top_k)
    answer = generate_answer(question, contexts, model, tokenizer)
    
    return {
        'question': question,
        'retrieved_contexts': retrieved_info,
        'generated_answer': answer
    }
