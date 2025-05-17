from rag_qa import load_rag_system, rag_pipeline

# Load RAG system components once at startup
model_path = "ai_integration/t5-small-pubmedqa"
index_path = "ai_integration/pubmedqa_faiss.index"
context_map_path = "ai_integration/context_map.pkl"

model, tokenizer, embedding_model, index, context_map = load_rag_system(
    model_path, index_path, context_map_path
)

# Ask a question
question = "What is the treatment for hypertension in elderly patients?"
result = rag_pipeline(question, model, tokenizer, embedding_model, index, context_map)

print("Answer:", result['generated_answer'])
