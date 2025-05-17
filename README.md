# 🧠 MedQA: Retrieval-Augmented Medical QA with T5 and FAISS

![Medical QA](https://img.shields.io/badge/domain-biomedical_qa-blueviolet) 
![License](https://img.shields.io/badge/license-MIT-green)

A hybrid question answering system combining fine-tuned language models with semantic retrieval, optimized for biomedical literature. Built on PubMedQA data with T5 and FAISS integration.

## ✨ Features

- **Hybrid Architecture**: Combines T5 generation with FAISS-based retrieval
- **Medical Specialization**: Fine-tuned on PubMed's artificial QA subset
- **Efficient Retrieval**: Sentence-BERT embeddings + FAISS indexing
- **Custom Prompts**: Domain-specific response formatting
- **End-to-End Pipeline**: From data prep to inference in single notebook

## 📂 Project Structure

```
├── medqa.ipynb               # Main workflow notebook
├── pubmedqa_preprocessed.csv # Cleaned QA pairs
├── t5-small-pubmedqa/        # Fine-tuned model weights
│   ├── config.json
│   ├── pytorch_model.bin
│   └── tokenizer/
├── pubmedqa_faiss.index      # FAISS vector index
└── context_map.pkl           # Context metadata
```

## 🛠️ Installation

```bash
# Core dependencies
pip install transformers datasets sentence-transformers faiss-cpu pandas numpy torch

# Optional: CUDA support
pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu117
```

## 📊 Dataset Details

- **Source**: [PubMedQA (pqa_artificial subset)](https://huggingface.co/datasets/qiaojin/PubMedQA)
- **Statistics**: 190K training samples, 21K validation
- **Fields**:
  - `question`: Clinical/biomedical question
  - `context`: Research abstract paragraphs
  - `long_answer`: Detailed expert answer

## 🚀 Implementation Workflow

### 1. Data Preparation
```python
# Preprocess context into single string
def preprocess_context(context):
    if isinstance(context, list):
        return " ".join(str(p) for p in context)
    return str(context)

df['input_text'] = 'question: ' + df.question + ' context: ' + df.processed_context
```

### 2. Model Training
- **Base Model**: `t5-small` (60M parameters)
- **Training Config**:
  ```python
  training_args = TrainingArguments(
      output_dir="./results",
      num_train_epochs=3,
      per_device_train_batch_size=8,
      learning_rate=3e-5,
      fp16=True  # Enable mixed-precision
  )
  ```
- **Training Time**: ~6.8 hours on NVIDIA T4 GPU

### 3. FAISS Indexing
```python
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
context_embeddings = embedding_model.encode(contexts)
faiss.normalize_L2(context_embeddings)  # Crucial for cosine similarity

index = faiss.IndexFlatL2(384)  # 384-dim embeddings
index.add(context_embeddings)
```

## 💡 Inference Pipeline

### Basic Usage
```python
def retrieve_context(question, top_k=3):
    query_embed = embedding_model.encode([question])
    distances, indices = index.search(query_embed, top_k)
    return [context_map[idx]["context"] for idx in indices[0]]
```

### Custom Medical Prompting
```python
medical_prompt = """You are a clinical assistant. Answer concisely using the context.

Question: {question}
Relevant Research Contexts:
{context}

Evidence-Based Answer:"""

response = rag_pipeline(
    "Mechanism of action of TNF-alpha inhibitors in rheumatoid arthritis?",
    prompt_template=medical_prompt
)
```

### Sample Output
```markdown
## Question
Mechanism of action of TNF-alpha inhibitors in rheumatoid arthritis?

## Answer
TNF-alpha inhibitors bind to and neutralize tumor necrosis factor-alpha, 
reducing inflammatory response and joint damage progression in RA patients.

## Retrieved Contexts
1. TNF-α plays central role in RA pathophysiology by promoting synovitis...
2. Biologic DMARDs like adalimumab work through TNF blockade...
3. Clinical trials show TNF inhibitors reduce radiographic progression...
```

## 🚨 Troubleshooting

**CUDA/CPU Device Mismatch**
```python
# Explicit device allocation
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)
input_ids = input_ids.to(device)
```

**FAISS Optimization Tip**
```python
# Use faster IndexIVFFlat for large datasets
quantizer = faiss.IndexFlatL2(384)
index = faiss.IndexIVFFlat(quantizer, 384, 100)
index.train(context_embeddings)
index.add(context_embeddings)
```

## 🔮 Future Roadmap

- [ ] Add PubMedBERT-based re-ranker for retrieval
- [ ] Implement Gradio/Streamlit web interface
- [ ] Expand to full PubMedQA dataset (1M+ samples)
- [ ] Quantized model deployment with ONNX
- [ ] Multi-document evidence aggregation

## 📚 Resources

- [PubMedQA Paper](https://arxiv.org/abs/2009.06053)
- [T5 Documentation](https://huggingface.co/docs/transformers/model_doc/t5)
- [FAISS Best Practices](https://github.com/facebookresearch/faiss/wiki/Best-practices)

## 📜 License

MIT License - See [LICENSE](LICENSE) for details.

---

**Note**: For production deployment, consider:
- Switching to `t5-base`/`t5-large` models
- GPU-optimized FAISS version
- Database-backed context storage
- Rate limiting for API endpoints
