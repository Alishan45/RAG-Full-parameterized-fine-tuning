#models\Authuser.py
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash
import os

DB_PATH = os.path.join('instance', 'database.db')

class AuthUser:
    @staticmethod
    def init_db():
        """Initialize the SQLite database with required tables."""
        if not os.path.exists('instance'):
            os.makedirs('instance')
            
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        ''')
        conn.commit()
        conn.close()

    @staticmethod
    def signup(email, password):
        """Create a new user account."""
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            hashed_pw = generate_password_hash(password)
            cursor.execute('INSERT INTO users (email, password) VALUES (?, ?)',
                           (email, hashed_pw))
            conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False
        finally:
            conn.close()

    @staticmethod
    def login(email, password):
        """Verify user credentials and return user info if valid."""
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT id, email, password FROM users WHERE email = ?', (email,))
        user = cursor.fetchone()
        conn.close()

        if user and check_password_hash(user[2], password):
            return {'id': user[0], 'email': user[1]}
        return None

    @staticmethod
    def get_user_by_id(user_id):
        """Get user by ID."""
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT id, email FROM users WHERE id = ?', (user_id,))
        user = cursor.fetchone()
        conn.close()
        return {'id': user[0], 'email': user[1]} if user else None

    @staticmethod
    def get_user_by_email(email):
        """Get user by email."""
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT id, email FROM users WHERE email = ?', (email,))
        user = cursor.fetchone()
        conn.close()
        return {'id': user[0], 'email': user[1]} if user else None

    @staticmethod
    def update_password(user_id, new_password):
        """Update a user's password."""
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            hashed_pw = generate_password_hash(new_password)
            cursor.execute('UPDATE users SET password = ? WHERE id = ?',
                           (hashed_pw, user_id))
            conn.commit()
            return cursor.rowcount > 0
        except Exception as e:
            print(f"Error updating password: {str(e)}")
            return False
        finally:
            conn.close()