// Regular expressions
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/;

// Utility functions
function showError(input, message) {
    const formGroup = input.closest('.form-group');
    let errorElement = formGroup.querySelector('.error-message');
    
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        formGroup.appendChild(errorElement);
    }
    
    errorElement.textContent = message;
    input.classList.add('error');
}

function clearError(input) {
    const formGroup = input.closest('.form-group');
    const errorElement = formGroup.querySelector('.error-message');
    
    if (errorElement) {
        errorElement.remove();
    }
    
    input.classList.remove('error');
}

function validateEmail(emailInput) {
    const email = emailInput.value.trim();
    
    if (!email) {
        showError(emailInput, 'Email is required');
        return false;
    }
    
    if (!emailRegex.test(email)) {
        showError(emailInput, 'Please enter a valid email address');
        return false;
    }
    
    clearError(emailInput);
    return true;
}

function validatePassword(passwordInput, fieldName = 'Password') {
    const password = passwordInput.value;
    
    if (!password) {
        showError(passwordInput, `${fieldName} is required`);
        return false;
    }
    
    if (!passwordRegex.test(password)) {
        showError(passwordInput, `${fieldName} must be at least 8 characters long and contain letters, numbers, and special characters`);
        return false;
    }
    
    clearError(passwordInput);
    return true;
}

function validateConfirmPassword(passwordInput, confirmPasswordInput) {
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    
    if (password !== confirmPassword) {
        showError(confirmPasswordInput, 'Passwords do not match');
        return false;
    }
    
    clearError(confirmPasswordInput);
    return true;
}

// Form validation setup
document.addEventListener('DOMContentLoaded', function() {
    // Signup Form Validation
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', function(e) {
            const emailInput = signupForm.querySelector('#email');
            const passwordInput = signupForm.querySelector('#password');
            
            const isEmailValid = validateEmail(emailInput);
            const isPasswordValid = validatePassword(passwordInput);
            
            if (!isEmailValid || !isPasswordValid) {
                e.preventDefault();
            }
        });
        
        // Add real-time validation
        const signupEmail = signupForm.querySelector('#email');
        const signupPassword = signupForm.querySelector('#password');
        
        signupEmail.addEventListener('blur', () => validateEmail(signupEmail));
        signupPassword.addEventListener('blur', () => validatePassword(signupPassword));
    }
    
    // Login Form Validation
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            const emailInput = loginForm.querySelector('#email');
            const passwordInput = loginForm.querySelector('#password');
            
            const isEmailValid = validateEmail(emailInput);
            const isPasswordValid = validatePassword(passwordInput);
            
            if (!isEmailValid || !isPasswordValid) {
                e.preventDefault();
            }
        });
        
        // Add real-time validation
        const loginEmail = loginForm.querySelector('#email');
        const loginPassword = loginForm.querySelector('#password');
        
        loginEmail.addEventListener('blur', () => validateEmail(loginEmail));
        loginPassword.addEventListener('blur', () => validatePassword(loginPassword));
    }
    
    // Change Password Form Validation
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', function(e) {
            const emailInput = changePasswordForm.querySelector('#email');
            const newPasswordInput = changePasswordForm.querySelector('#newPassword');
            const confirmPasswordInput = changePasswordForm.querySelector('#confirmPassword');
            
            const isEmailValid = validateEmail(emailInput);
            const isNewPasswordValid = validatePassword(newPasswordInput, 'New password');
            const isConfirmPasswordValid = validateConfirmPassword(newPasswordInput, confirmPasswordInput);
            
            if (!isEmailValid || !isNewPasswordValid || !isConfirmPasswordValid) {
                e.preventDefault();
            }
        });
        
        // Add real-time validation
        const changeEmail = changePasswordForm.querySelector('#email');
        const newPassword = changePasswordForm.querySelector('#newPassword');
        const confirmPassword = changePasswordForm.querySelector('#confirmPassword');
        
        changeEmail.addEventListener('blur', () => validateEmail(changeEmail));
        newPassword.addEventListener('blur', () => validatePassword(newPassword, 'New password'));
        confirmPassword.addEventListener('blur', () => {
            validatePassword(confirmPassword, 'Confirm password');
            validateConfirmPassword(newPassword, confirmPassword);
        });
        
        // Password strength indicator (optional)
        if (newPassword) {
            newPassword.addEventListener('input', function() {
                const strengthBar = document.getElementById('passwordStrengthBar');
                if (!strengthBar) return;
                
                const password = this.value;
                let strength = 0;
                
                if (password.length >= 8) strength += 1;
                if (/[a-zA-Z]/.test(password)) strength += 1;
                if (/\d/.test(password)) strength += 1;
                if (/[^a-zA-Z\d]/.test(password)) strength += 1;
                
                const width = (strength / 4) * 100;
                strengthBar.style.width = `${width}%`;
                
                // Change color based on strength
                if (strength <= 1) {
                    strengthBar.style.backgroundColor = '#ff4d4d';
                } else if (strength <= 3) {
                    strengthBar.style.backgroundColor = '#ffa500';
                } else {
                    strengthBar.style.backgroundColor = '#4CAF50';
                }
            });
        }
    }
});