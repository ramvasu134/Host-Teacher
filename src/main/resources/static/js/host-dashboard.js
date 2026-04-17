// ===== Host Dashboard JavaScript - Host Mtng =====

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initTheme();
    initUserData();
});

// ===== Sidebar Functions =====
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
}

// ===== Settings Dropdown =====
function toggleSettingsDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('settingsDropdown');
    dropdown.classList.toggle('show');
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('settingsDropdown');
    const settingsBtn = document.querySelector('.btn-settings');
    if (dropdown && !dropdown.contains(event.target) && !settingsBtn.contains(event.target)) {
        dropdown.classList.remove('show');
    }
});

// ===== Theme Functions =====
function initTheme() {
    const savedTheme = localStorage.getItem('hostTheme') || 'dark';
    applyTheme(savedTheme);
    updateThemeSelection(savedTheme);
}

function applyTheme(theme) {
    document.body.className = 'theme-' + theme;
    localStorage.setItem('hostTheme', theme);
    updateThemeSelection(theme);
    closeThemes();
}

function updateThemeSelection(theme) {
    // Remove active class from all options
    document.querySelectorAll('.theme-option').forEach(opt => {
        opt.classList.remove('active');
    });
    // Add active class to selected theme
    const activeOption = document.querySelector(`.theme-option[data-theme="${theme}"]`);
    if (activeOption) {
        activeOption.classList.add('active');
    }
}

function openThemes(event) {
    event.preventDefault();
    document.getElementById('settingsDropdown').classList.remove('show');
    document.getElementById('themesModalOverlay').classList.add('show');
    document.getElementById('themesModal').classList.add('show');
}

function closeThemes() {
    document.getElementById('themesModalOverlay').classList.remove('show');
    document.getElementById('themesModal').classList.remove('show');
}

// ===== Password Change Functions =====
function openChangePassword(event) {
    event.preventDefault();
    document.getElementById('settingsDropdown').classList.remove('show');
    document.getElementById('passwordModalOverlay').classList.add('show');
    document.getElementById('passwordModal').classList.add('show');
    clearPasswordForm();
}

function closeChangePassword() {
    document.getElementById('passwordModalOverlay').classList.remove('show');
    document.getElementById('passwordModal').classList.remove('show');
    clearPasswordForm();
}

function clearPasswordForm() {
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    const feedback = document.getElementById('passwordFeedback');
    feedback.className = 'feedback-message';
    feedback.textContent = '';
    feedback.style.display = 'none';
}

function togglePasswordVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    const icon = button.querySelector('i');

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function submitPasswordChange() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const feedback = document.getElementById('passwordFeedback');

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
        showFeedback(feedback, 'Please fill in all fields.', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showFeedback(feedback, 'New password must be at least 6 characters.', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showFeedback(feedback, 'New passwords do not match.', 'error');
        return;
    }

    // Submit to server
    fetch('/api/user/change-password', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            currentPassword: currentPassword,
            newPassword: newPassword
        })
    })
    .then(response => {
        if (response.ok) {
            showFeedback(feedback, 'Password changed successfully!', 'success');
            setTimeout(() => closeChangePassword(), 1500);
        } else {
            return response.json().then(data => {
                throw new Error(data.message || 'Failed to change password');
            });
        }
    })
    .catch(error => {
        showFeedback(feedback, error.message || 'An error occurred. Please try again.', 'error');
    });
}

function showFeedback(element, message, type) {
    element.textContent = message;
    element.className = 'feedback-message ' + type;
    element.style.display = 'block';
}

// ===== User Data =====
function initUserData() {
    // Any additional user data initialization
}

// ===== Keyboard Shortcuts =====
document.addEventListener('keydown', function(event) {
    // Escape to close modals
    if (event.key === 'Escape') {
        closeChangePassword();
        closeThemes();
        document.getElementById('settingsDropdown').classList.remove('show');
    }
});

