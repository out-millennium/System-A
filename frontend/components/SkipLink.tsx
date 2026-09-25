"use client";

import { useT } from "@/lib/i18n";

/* Keyboard "skip to main content" link — an accessibility aid for keyboard and
   screen-reader users, letting them jump past the navigation straight to the
   page content. Hidden until focused via Tab (see .sa-skip-link in globals.css).

   We don't rely on the default `href="#id"` jump — browsers often move the URL
   hash without actually moving keyboard focus. Instead we explicitly focus and
   scroll the main region so the NEXT Tab lands inside the content. */
export default function SkipLink() {
  const t = useT();

  function skip(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    const main = document.getElementById("main-content");
    if (!main) return;
    main.setAttribute("tabindex", "-1");
    main.focus({ preventScroll: false });
    main.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <a href="#main-content" className="sa-skip-link" onClick={skip}>
      {t("a11y.skipToContent")}
    </a>
  );
}
