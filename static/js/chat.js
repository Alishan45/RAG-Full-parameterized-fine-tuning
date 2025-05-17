// Modified chat.js for MedGPT with enhanced features
document.addEventListener("DOMContentLoaded", function () {
  const chatMessages = document.getElementById("chat-messages");
  const userInput = document.getElementById("user-input");
  const sendButton = document.getElementById("send-button");
  const fileInput = document.getElementById("file-input");
  const modelSelector = document.getElementById("model-choice");
  const sidebar = document.getElementById("history-sidebar"); 
  const historyToggle = document.getElementById("history-toggle");
  const closeSidebarBtn = document.getElementById("close-sidebar");
  const newChatBtn = document.getElementById("new-chat-btn");
  const searchInput = document.getElementById("search-sessions");

  // Modal Elements
  const renameModal = document.getElementById("rename-modal");
  const deleteModal = document.getElementById("delete-modal");
  const newTitleInput = document.getElementById("new-title-input");
  const sessionIdToRename = document.getElementById("session-id-to-rename");
  const sessionIdToDelete = document.getElementById("session-id-to-delete");
  const saveRenameBtn = document.getElementById("save-rename-btn");
  const cancelDeleteBtn = document.getElementById("cancel-delete-btn");
  const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
  const closeModalBtns = document.querySelectorAll(".close-modal");

  // State Management
  let activeSessionId = null;
  let currentModel = modelSelector.value;
  let sessionsList = [];

  // Configure marked options for markdown parsing
  marked.setOptions({
    renderer: new marked.Renderer(),
    highlight: function (code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
    langPrefix: "hljs language-", // highlight.js css expects a top-level 'hljs' class
    pedantic: false,
    gfm: true,
    breaks: true,
    sanitize: false,
    smartypants: false,
    xhtml: false,
  });

  // Check system status on load
  checkSystemStatus();

  // Add welcome message based on selected model
  updateWelcomeMessage();

  // Load chat history when page loads
  loadChatHistory();

  // Sidebar toggle functionality
  historyToggle.addEventListener("click", function() {
    sidebar.classList.add("active");
  });

  closeSidebarBtn.addEventListener("click", function() {
    sidebar.classList.remove("active");
  });

  // New chat button functionality
  newChatBtn.addEventListener("click", createNewChat);

  // Add model selection change listener
  modelSelector.addEventListener("change", function() {
    currentModel = this.value;
    updateWelcomeMessage();
  });

  // Search functionality
  searchInput.addEventListener("input", function() {
    const searchTerm = this.value.toLowerCase();
    filterSessions(searchTerm);
  });

  // Modal close buttons
  closeModalBtns.forEach(btn => {
    btn.addEventListener("click", function() {
      renameModal.style.display = "none";
      deleteModal.style.display = "none";
    });
  });

  // Modal save rename button
  saveRenameBtn.addEventListener("click", function() {
    const newTitle = newTitleInput.value.trim();
    if (newTitle && sessionIdToRename.value) {
      renameSession(sessionIdToRename.value, newTitle);
    }
  });

  // Modal delete buttons
  cancelDeleteBtn.addEventListener("click", function() {
    deleteModal.style.display = "none";
  });

  confirmDeleteBtn.addEventListener("click", function() {
    if (sessionIdToDelete.value) {
      deleteSession(sessionIdToDelete.value);
    }
  });

  // Main event listeners
  sendButton.addEventListener("click", sendMessage);
  userInput.addEventListener("keypress", function (e) {
    if (e.key === "Enter") sendMessage();
  });
  fileInput.addEventListener("change", handleFileUpload);

  // Close modals when clicking outside
  window.addEventListener("click", function(event) {
    if (event.target === renameModal) {
      renameModal.style.display = "none";
    } else if (event.target === deleteModal) {
      deleteModal.style.display = "none";
    }
  });

  // Check system status to ensure models are available
  function checkSystemStatus() {
    fetch("/api/check-system-status")
      .then(response => response.json())
      .then(data => {
        if (!data.rag_system) {
          // If RAG system is not available, disable the option
          const ragOption = Array.from(modelSelector.options).find(opt => opt.value === "rag");
          if (ragOption) {
            ragOption.disabled = true;
            ragOption.text += " (unavailable)";
          }
          
          // If current selection is RAG, switch to Gemini
          if (currentModel === "rag") {
            modelSelector.value = "gemini";
            currentModel = "gemini";
            updateWelcomeMessage();
          }
        }
        
        if (!data.gemini_api) {
          // If Gemini API is not available, disable the option
          const geminiOption = Array.from(modelSelector.options).find(opt => opt.value === "gemini");
          if (geminiOption) {
            geminiOption.disabled = true;
            geminiOption.text += " (unavailable)";
          }
          
          // If current selection is Gemini, switch to RAG if available
          if (currentModel === "gemini" && data.rag_system) {
            modelSelector.value = "rag";
            currentModel = "rag";
            updateWelcomeMessage();
          }
        }
        
        // If neither system is available, show error message
        if (!data.rag_system && !data.gemini_api) {
          addBotMessage("⚠️ No AI models are currently available. Please check your server configuration.", false);
        }
      })
      .catch(error => {
        console.error("Error checking system status:", error);
      });
  }

  // Update welcome message based on current model
  function updateWelcomeMessage() {
    // Clear existing messages only if the chat is empty
    if (chatMessages.querySelectorAll(".message").length <= 1) {
      chatMessages.innerHTML = "";
      
      if (currentModel === "gemini") {
        addBotMessage("Hello! I'm your Medical Assistant powered by Gemini. How can I help you today?");
      } else {
        addBotMessage("Hello! I'm your Medical Assistant using the RAG model specialized in medical knowledge. How can I help you today?");
      }
    }
  }

  // Create a new chat session
  function createNewChat() {
    fetch("/api/chat/new", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      }
    })
    .then(response => {
      if (!response.ok) {
        if (response.status === 401) {
          // Handle unauthorized (not logged in)
          window.location.href = "/login";
          return;
        }
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.session_id) {
        // Clear current chat and update session ID
        chatMessages.innerHTML = "";
        activeSessionId = data.session_id;
        
        // Add welcome message
        updateWelcomeMessage();
        
        // Update UI to reflect new session
        sidebar.classList.remove("active"); // Close sidebar
        
        // Refresh chat history to show new session
        loadChatHistory();
      }
    })
    .catch(error => {
      console.error("Error creating new chat:", error);
    });
  }

  function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;

    addUserMessage(message);
    userInput.value = "";

    // Show loading indicator
    const loadingDiv = document.createElement("div");
    loadingDiv.className = "message bot-message";
    loadingDiv.innerHTML = '<div class="loading"></div>';
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Send to backend with model selection
    fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        message: message,
        model: currentModel 
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        // Remove loading indicator
        chatMessages.removeChild(loadingDiv);

        if (data.error) {
          addBotMessage("Sorry, I encountered an error: " + data.error);
        } else {
          // Use markdown rendering for the response
          addBotMessage(data.response, true);
          
          // If RAG model was used and context info is provided, show it
          if (data.context_info && data.context_info.length > 0) {
            addContextInfo(data.context_info);
          }
        }
        
        // Refresh chat history after a message exchange
        loadChatHistory();
      })
      .catch((error) => {
        console.error("Error in chat request:", error);
        chatMessages.removeChild(loadingDiv);
        addBotMessage(`Sorry, there was a connection error: ${error.message}. Please check the console for more details.`);
      });
  }

  async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Show uploading message
    addUserMessage(`Uploading file: ${file.name}...`);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        addBotMessage(`Error processing file: ${data.error}`);
      } else {
        addBotMessage(
          `I've received your ${file.name}. Here's a summary of its contents:`
        );

        // Send extracted text to chat
        const prompt = `Summarize this medical document and highlight key findings:\n\n${data.content}`;

        // Show loading
        const loadingDiv = document.createElement("div");
        loadingDiv.className = "message bot-message";
        loadingDiv.innerHTML = '<div class="loading"></div>';
        chatMessages.appendChild(loadingDiv);

        // Process with selected model
        const chatResponse = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            message: prompt,
            model: currentModel 
          }),
        });

        chatMessages.removeChild(loadingDiv);
        
        if (!chatResponse.ok) {
          const errorData = await chatResponse.json();
          throw new Error(errorData.error || `HTTP error! Status: ${chatResponse.status}`);
        }
        
        const chatData = await chatResponse.json();

        if (chatData.error) {
          addBotMessage("Error analyzing document: " + chatData.error);
        } else {
          // Use markdown rendering for the response
          addBotMessage(chatData.response, true);
          
          // If RAG model was used and context info is provided, show it
          if (chatData.context_info && chatData.context_info.length > 0) {
            addContextInfo(chatData.context_info);
          }
        }
        
        // Refresh chat history after file upload and processing
        loadChatHistory();
      }
    } catch (error) {
      console.error("Error in file upload:", error);
      addBotMessage("Failed to upload file: " + error.message);
    }

    // Reset file input
    event.target.value = "";
  }

  function addUserMessage(text) {
    const messageDiv = document.createElement("div");
    messageDiv.className = "message user-message";
    messageDiv.textContent = text;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function addBotMessage(text, useMarkdown = false) {
    const messageDiv = document.createElement("div");
    messageDiv.className = "message bot-message";

    // Add model badge to show which model generated the response
    const modelBadge = document.createElement("span");
    modelBadge.className = "model-badge";
    modelBadge.textContent = currentModel === "gemini" ? "Gemini" : "RAG";
    messageDiv.appendChild(modelBadge);

    if (useMarkdown) {
      // Create container for markdown content
      const markdownContent = document.createElement("div");
      markdownContent.className = "markdown-content";

      try {
        // Convert markdown to HTML and set it
        markdownContent.innerHTML = marked.parse(text);
  
        // Append markdown content to message div
        messageDiv.appendChild(markdownContent);
  
        // Apply syntax highlighting to code blocks
        setTimeout(() => {
          messageDiv.querySelectorAll("pre code").forEach((block) => {
            hljs.highlightAll();
          });
        }, 0);
      } catch (e) {
        console.error("Error parsing markdown:", e);
        // Fall back to plain text if markdown parsing fails
        const textDiv = document.createElement("div");
        textDiv.textContent = text;
        messageDiv.appendChild(textDiv);
      }
    } else {
      // For non-markdown text (e.g., simple messages)
      const textDiv = document.createElement("div");
      textDiv.textContent = text;
      messageDiv.appendChild(textDiv);
    }

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Function to display RAG context information
  function addContextInfo(contextInfo) {
    const contextDiv = document.createElement("div");
    contextDiv.className = "context-info";
    
    const contextHeader = document.createElement("div");
    contextHeader.innerHTML = "<strong>Sources used for this answer:</strong>";
    contextDiv.appendChild(contextHeader);
    
    // Add each context source with its confidence score
    contextInfo.forEach((ctx, index) => {
      if (ctx.similarity_score) {
        const ctxItem = document.createElement("div");
        ctxItem.className = "context-item";
        
        // Format the similarity score as a percentage
        const scorePercent = Math.round(ctx.similarity_score * 100);
        
        ctxItem.innerHTML = `
          <span class="context-source">${index + 1}. "${ctx.original_question.substring(0, 50)}${ctx.original_question.length > 50 ? '...' : ''}"</span>
          <span class="context-score">${scorePercent}% match</span>
        `;
        contextDiv.appendChild(ctxItem);
      }
    });
    
    chatMessages.appendChild(contextDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Enhanced loadChatHistory function
  async function loadChatHistory() {
    try {
      const response = await fetch("/api/chat/sessions");
      if (!response.ok) {
        // If unauthorized or other error, just return
        if (response.status === 401) {
          // Handle guest user (no history)
          document.getElementById("sessions-list").innerHTML = `
            <div class="no-sessions">
              <p>Login to save your conversations</p>
              <a href="/login" class="primary-btn">Login</a>
            </div>
          `;
        }
        return;
      }
      
      const data = await response.json();
      const sessionsList = document.getElementById("sessions-list");
      
      if (!sessionsList) {
        return; // Sessions list element doesn't exist
      }

      if (data.sessions && data.sessions.length > 0) {
        // Save the sessions data
        sessions = data.sessions;
        
        // Clear and rebuild the list
        sessionsList.innerHTML = "";

        data.sessions.forEach((session) => {
          const sessionItem = document.createElement("div");
          sessionItem.className = "session-item";
          if (session.id === activeSessionId) {
            sessionItem.classList.add("active");
          }
          
          const formattedDate = new Date(session.created_at).toLocaleString();
          
          sessionItem.innerHTML = `
            <div class="session-content">
              <div class="session-title">${session.title || "New Chat"}</div>
              <div class="session-date">${formattedDate}</div>
            </div>
            <div class="session-actions">
              <button class="edit-session" data-id="${session.id}" title="Rename">
                <i class="fas fa-pen"></i>
              </button>
              <button class="delete-session" data-id="${session.id}" title="Delete">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          `;

          // Add event listener to session item
          sessionItem.querySelector(".session-content").addEventListener("click", () => {
            loadSession(session.id);
          });
          
          // Add event listeners for edit and delete buttons
          sessionItem.querySelector(".edit-session").addEventListener("click", (e) => {
            e.stopPropagation();
            openRenameModal(session.id, session.title);
          });
          
          sessionItem.querySelector(".delete-session").addEventListener("click", (e) => {
            e.stopPropagation();
            openDeleteModal(session.id);
          });
          
          sessionsList.appendChild(sessionItem);
        });

        // If no active session is set, load the most recent one
        if (!activeSessionId) {
          activeSessionId = data.sessions[0].id;
          loadSession(activeSessionId);
        }
      } else {
        sessionsList.innerHTML = `<div class="no-sessions">No conversations yet</div>`;
      }
    } catch (error) {
      console.error("Error loading chat history:", error);
    }
  }

  // Filter sessions by search term
  function filterSessions(searchTerm) {
    const sessionItems = document.querySelectorAll(".session-item");
    
    sessionItems.forEach(item => {
      const title = item.querySelector(".session-title").textContent.toLowerCase();
      if (title.includes(searchTerm)) {
        item.style.display = "flex";
      } else {
        item.style.display = "none";
      }
    });
  }

  // Open rename modal
  function openRenameModal(sessionId, currentTitle) {
    sessionIdToRename.value = sessionId;
    newTitleInput.value = currentTitle || "";
    renameModal.style.display = "block";
    newTitleInput.focus();
  }

  // Open delete modal
  function openDeleteModal(sessionId) {
    sessionIdToDelete.value = sessionId;
    deleteModal.style.display = "block";
  }

  // Rename session
  async function renameSession(sessionId, newTitle) {
    try {
      const response = await fetch(`/api/chat/session/${sessionId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: newTitle }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      // Close modal and refresh history
      renameModal.style.display = "none";
      loadChatHistory();
    } catch (error) {
      console.error("Error renaming session:", error);
    }
  }

  // Delete session
  async function deleteSession(sessionId) {
    try {
      const response = await fetch(`/api/chat/session/${sessionId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      // Close modal and refresh history
      deleteModal.style.display = "none";
      
      // If we deleted the active session, clear the chat area
      if (sessionId === activeSessionId) {
        chatMessages.innerHTML = "";
        activeSessionId = null;
        updateWelcomeMessage();
      }
      
      // Refresh chat history
      loadChatHistory();
    } catch (error) {
      console.error("Error deleting session:", error);
    }
  }

  async function loadSession(sessionId) {
    try {
      const response = await fetch(`/api/chat/session/${sessionId}`);
      if (!response.ok) {
        console.error("Error loading session:", response.statusText);
        return;
      }
      
      const data = await response.json();

      // Clear current chat
      chatMessages.innerHTML = "";
      
      // Update active session
      activeSessionId = sessionId;
      
      // Update sidebar to show active session
      document.querySelectorAll(".session-item").forEach(item => {
        item.classList.remove("active");
        if (item.querySelector(".edit-session").getAttribute("data-id") === sessionId) {
          item.classList.add("active");
        }
      });
      
      // Close sidebar on mobile
      sidebar.classList.remove("active");

      // Add messages to chat in correct order
      if (data.messages && data.messages.length > 0) {
        data.messages.forEach((msg) => {
          if (msg.role === "user") {
            addUserMessage(msg.content);
          } else {
            // For bot messages, check if there's model info
            const modelType = msg.model || "gemini"; // Default to gemini if not specified
            currentModel = modelType; // Update the current model selection
            
            // Update the dropdown to match
            modelSelector.value = modelType;
            
            // Display the message
            addBotMessage(msg.content, true);
            
            // If RAG context exists, display it
            if (msg.context_info) {
              try {
                const contextInfo = JSON.parse(msg.context_info);
                if (contextInfo && contextInfo.length > 0) {
                  addContextInfo(contextInfo);
                }
              } catch (e) {
                console.error("Failed to parse context info", e);
              }
            }
          }
        });
      } else {
        // If no messages, add welcome message
        updateWelcomeMessage();
      }
    } catch (error) {
      console.error("Error loading session:", error);
    }
  }
});