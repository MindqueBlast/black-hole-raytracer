import './style.css';
import { initTheme } from './ui/theme.js';

initTheme();

const accordion = document.getElementById('guide-accordion');
if (accordion) {
  accordion.querySelectorAll('.accordion-header').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.accordion-item');
      if (!item) return;
      const wasOpen = item.classList.contains('active');
      accordion.querySelectorAll('.accordion-item').forEach((el) => {
        el.classList.remove('active');
        el.querySelector('.accordion-header')?.setAttribute('aria-expanded', 'false');
      });
      if (!wasOpen) {
        item.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
}
