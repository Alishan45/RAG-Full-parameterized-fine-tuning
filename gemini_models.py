import google.generativeai as genai
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure Gemini
genai.configure(api_key=os.getenv('GEMINI_API_KEY'))

def list_available_models():
    try:
        models = genai.list_models()
        return [model.name for model in models]
    except Exception as e:
        print(f"Error listing models: {e}")
        return []

# Run if this file is executed directly
if __name__ == "__main__":
    models = list_available_models()
    if models:
        print("Available Gemini models:")
        for m in models:
            print(f" - {m}")
    else:
        print("No models found or an error occurred.")
