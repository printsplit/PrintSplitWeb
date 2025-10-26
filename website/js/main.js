// Scrolling behavior removed per user request

// ===== Intersection Observer for Animations =====
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe feature cards and step cards
document.addEventListener('DOMContentLoaded', () => {
    const animatedElements = document.querySelectorAll('.feature-card, .step-card, .download-card');
    animatedElements.forEach(el => {
        observer.observe(el);
    });
});

// ===== Download Button Analytics (placeholder) =====
document.querySelectorAll('.btn[href="#"]').forEach(button => {
    button.addEventListener('click', (e) => {
        if (button.textContent.includes('Download')) {
            e.preventDefault();
            console.log('Download clicked - Add your download logic here');

            // You can add actual download logic or redirect here
            // window.location.href = 'path/to/download';

            // Show alert for demo
            alert('Download will be available soon! Check the GitHub repository for the latest releases.');
        }
    });
});

// Parallax effect removed per user request

// ===== Copy Code on Click (for code blocks) =====
document.querySelectorAll('.code-preview code').forEach(codeBlock => {
    codeBlock.style.cursor = 'pointer';
    codeBlock.title = 'Click to copy';

    codeBlock.addEventListener('click', async () => {
        const text = codeBlock.textContent;

        try {
            await navigator.clipboard.writeText(text);

            // Show feedback
            const originalText = codeBlock.innerHTML;
            codeBlock.innerHTML = '<span style="color: #38ef7d;">✓ Copied to clipboard!</span>';

            setTimeout(() => {
                codeBlock.innerHTML = originalText;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    });
});

// ===== Easter Egg: Konami Code =====
let konamiCode = [];
const konamiPattern = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

document.addEventListener('keydown', (e) => {
    konamiCode.push(e.key);
    konamiCode.splice(-konamiPattern.length - 1, konamiCode.length - konamiPattern.length);

    if (konamiCode.join('') === konamiPattern.join('')) {
        activateEasterEgg();
    }
});

function activateEasterEgg() {
    document.body.style.animation = 'rainbow 2s linear infinite';

    const style = document.createElement('style');
    style.textContent = `
        @keyframes rainbow {
            0% { filter: hue-rotate(0deg); }
            100% { filter: hue-rotate(360deg); }
        }
    `;
    document.head.appendChild(style);

    setTimeout(() => {
        document.body.style.animation = '';
    }, 5000);

    console.log('🎉 Easter egg activated! You found the secret!');
}

// ===== Loading Animation =====
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    setTimeout(() => {
        document.body.style.transition = 'opacity 0.5s';
        document.body.style.opacity = '1';
    }, 100);
});

// ===== Console Message =====
console.log('%c PrintSplit ', 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-size: 20px; padding: 10px; border-radius: 5px;');
console.log('%c Thanks for checking out the code! 🚀 ', 'color: #667eea; font-size: 14px;');
console.log('%c GitHub: https://github.com/yourusername/printsplit ', 'color: #764ba2; font-size: 12px;');
