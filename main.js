// Main JavaScript for modular website

// Load all sections on page load
document.addEventListener('DOMContentLoaded', function() {
    loadSections();
    setupNavigation();
    setupScrollEffects();
});

// Function to load all sections
async function loadSections() {
    const sections = [
        { id: 'home-section', file: 'home.html' },
        { id: 'about-section', file: 'about.html' },
        { id: 'research-section', file: 'research.html' },
        { id: 'visualizations-section', file: 'visualizations.html' },
        { id: 'skills-section', file: 'skills.html' },
        { id: 'publications-section', file: 'publications.html' },
        { id: 'contact-section', file: 'contact.html' }
    ];

    for (const section of sections) {
        try {
            const response = await fetch(section.file);
            const html = await response.text();
            document.getElementById(section.id).innerHTML = html;
        } catch (error) {
            console.error(`Error loading ${section.file}:`, error);
        }
    }
}

// Setup smooth scrolling navigation
function setupNavigation() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const offset = 80;
                const targetPosition = target.offsetTop - offset;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// Setup scroll effects - active navigation highlighting
function setupScrollEffects() {
    window.addEventListener('scroll', () => {
        let current = '';
        const sections = document.querySelectorAll('section');
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (pageYOffset >= (sectionTop - 100)) {
                current = section.getAttribute('id');
            }
        });

        document.querySelectorAll('nav a').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === '#' + current) {
                link.classList.add('active');
            }
        });
    });
}
