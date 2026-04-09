"use client";

import { useState, useEffect } from "react";

interface TocItem {
  id: string;
  label: string;
}

export function HelpToc({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id || "");

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (!el) continue;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveId(item.id);
          }
        },
        { rootMargin: "-20% 0px -75% 0px", threshold: 0 }
      );

      observer.observe(el);
      observers.push(observer);
    }

    return () => observers.forEach((o) => o.disconnect());
  }, [items]);

  return (
    <nav className="hidden lg:block sticky top-8 self-start">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        On this page
      </p>
      <div className="space-y-0.5">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={`block text-sm py-1 transition-colors border-l-2 pl-3 ${
              activeId === item.id
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
            }`}
          >
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
