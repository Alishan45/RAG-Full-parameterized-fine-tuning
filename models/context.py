# context.py
import sqlite3
import time
import os
from datetime import datetime
from pathlib import Path

DB_PATH = os.path.join('instance', 'database.db')

class ChatContext:
    @staticmethod
    def init_db():
        """Initialize the SQLite database with required tables."""
        if not os.path.exists('instance'):
            os.makedirs('instance')

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Create chat_sessions table if it doesn't exist
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id TEXT PRIMARY KEY,
                user_id INTEGER,
                title TEXT DEFAULT 'New Chat',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        ''')

        # Create chat_messages table if it doesn't exist
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                role TEXT,
                content TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                model TEXT,
                context_info TEXT,
                FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
            )
        ''')

        conn.commit()
        conn.close()

    @staticmethod
    def create_session(user_id, title="New Chat"):
        """Create a new chat session and return the session ID."""
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        session_id = f"session_{int(time.time())}_{user_id}"
        try:
            cursor.execute(
                "INSERT INTO chat_sessions (id, user_id, title) VALUES (?, ?, ?)",
                (session_id, user_id, title)
            )
            conn.commit()
            return session_id
        except Exception as e:
            print(f"Error creating session: {e}")
            raise
        finally:
            conn.close()

    @staticmethod
    def add_message(session_id, role, content, model=None, context_info=None):
        """Add a message to a session."""
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        try:
            cursor.execute('''
                INSERT INTO chat_messages 
                (session_id, role, content, model, context_info)
                VALUES (?, ?, ?, ?, ?)
            ''', (session_id, role, content, model, context_info))
            conn.commit()
        except Exception as e:
            print(f"Error adding message: {e}")
            raise
        finally:
            conn.close()

    @staticmethod
    def get_session_messages(session_id, limit=None):
        """Retrieve all messages in a session."""
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        if limit:
            # Get the latest messages but return them in chronological order
            cursor.execute('''
                SELECT * FROM chat_messages
                WHERE session_id = ?
                ORDER BY timestamp DESC
                LIMIT ?
            ''', (session_id, limit))
            # Convert to list and reverse to get chronological order
            messages = [dict(row) for row in cursor.fetchall()]
            messages.reverse()  # Reverse to maintain chronological order
        else:
            cursor.execute('''
                SELECT * FROM chat_messages
                WHERE session_id = ?
                ORDER BY timestamp ASC
            ''', (session_id,))
            messages = [dict(row) for row in cursor.fetchall()]
            
        conn.close()
        return messages

    @staticmethod
    def get_session_info(session_id):
        """Get information about a session."""
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('''
            SELECT * FROM chat_sessions
            WHERE id = ?
        ''', (session_id,))
        
        session = cursor.fetchone()
        conn.close()
        
        return dict(session) if session else None

    @staticmethod
    def get_user_sessions(user_id):
        """Get all chat sessions for a user with their title and last message."""
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('''
            SELECT * FROM chat_sessions
            WHERE user_id = ?
            ORDER BY created_at DESC
        ''', (user_id,))

        sessions = [dict(row) for row in cursor.fetchall()]

        for session in sessions:
            # Get the first user message as title if title is default
            if session.get('title') == 'New Chat':
                cursor.execute('''
                    SELECT content FROM chat_messages
                    WHERE session_id = ? AND role = 'user'
                    ORDER BY timestamp ASC
                    LIMIT 1
                ''', (session['id'],))
                first_msg = cursor.fetchone()
                if first_msg:
                    session['title'] = first_msg['content']
                    if len(session['title']) > 30:
                        session['title'] = session['title'][:30] + '...'

            # Get the last message for preview
            cursor.execute('''
                SELECT content FROM chat_messages
                WHERE session_id = ?
                ORDER BY timestamp DESC
                LIMIT 1
            ''', (session['id'],))
            last_msg = cursor.fetchone()
            session['last_message'] = last_msg['content'] if last_msg else "No messages yet"

        conn.close()
        return sessions

    @staticmethod
    def rename_session(session_id, user_id, new_title):
        """Rename a chat session."""
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        try:
            cursor.execute('''
                UPDATE chat_sessions 
                SET title = ?
                WHERE id = ? AND user_id = ?
            ''', (new_title, session_id, user_id))
            conn.commit()
            return cursor.rowcount > 0
        except Exception as e:
            print(f"Error renaming session: {e}")
            return False
        finally:
            conn.close()

    @staticmethod
    def delete_session(session_id, user_id):
        """Delete a chat session and all its messages."""
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        try:
            # Verify the session belongs to the user
            cursor.execute('''
                SELECT id FROM chat_sessions
                WHERE id = ? AND user_id = ?
            ''', (session_id, user_id))
            
            if not cursor.fetchone():
                conn.close()
                return False
                
            # First delete all messages in the session
            cursor.execute('''
                DELETE FROM chat_messages
                WHERE session_id = ?
            ''', (session_id,))

            # Then delete the session itself
            cursor.execute('''
                DELETE FROM chat_sessions
                WHERE id = ? AND user_id = ?
            ''', (session_id, user_id))

            conn.commit()
            return True
        except Exception as e:
            print(f"Error deleting session: {e}")
            conn.rollback()
            return False
        finally:
            conn.close()