import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export function useShortcuts() {
  const router = useRouter();
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const openHelp = useCallback(() => setIsHelpOpen(true), []);
  const closeHelp = useCallback(() => setIsHelpOpen(false), []);

  useEffect(() => {
    let lastKey = '';
    let lastKeyTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable)
      ) {
        if (e.key === 'Escape') {
          active.blur();
        }
        return;
      }

      if (e.key === 'Escape') {
        setIsHelpOpen(false);
        window.dispatchEvent(new CustomEvent('close-all-modals'));
        return;
      }

      const now = Date.now();
      if (now - lastKeyTime > 1000) {
        lastKey = '';
      }

      const key = e.key;
      const isShift = e.shiftKey;

      if (key === '?' || (key === '/' && isShift)) {
        setIsHelpOpen(true);
        e.preventDefault();
        return;
      }

      if (key === '/') {
        const searchInput = document.querySelector('input[placeholder*="搜索"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          e.preventDefault();
        }
        return;
      }

      if (key === 'c' || key === 'n') {
        router.push('/?new=1');
        return;
      }

      if (key === 'q') {
        window.dispatchEvent(new CustomEvent('open-quick-dispatch'));
        return;
      }

      if (lastKey === 'g') {
        switch (key) {
          case 'i':
            router.push('/');
            break;
          case 'n':
            router.push('/inbox');
            break;
          case 'r':
            router.push('/runs');
            break;
          case 's':
            router.push('/settings');
            break;
        }
        lastKey = '';
        return;
      }

      if (key === 'g') {
        lastKey = 'g';
        lastKeyTime = now;
      } else {
        lastKey = '';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  return { isHelpOpen, openHelp, closeHelp };
}
