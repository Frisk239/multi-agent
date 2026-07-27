import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { resolveGChordRoute } from './shortcuts';

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
        const searchInput = document.querySelector(
          'input[placeholder*="搜索"]',
        ) as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          e.preventDefault();
        }
        return;
      }

      // g-chord 必须先于单键 c/n（否则 g c 会被「新建 Issue」吞掉）
      if (lastKey === 'g') {
        const route = resolveGChordRoute(key);
        if (route) {
          router.push(route);
          e.preventDefault();
        }
        lastKey = '';
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
