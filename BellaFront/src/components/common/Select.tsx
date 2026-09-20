import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import "./Select.css";

/**
 * Thin wrapper around a native `<select>` — NOT a custom listbox/combobox
 * rebuild (that's explicitly out of scope; see this project's standing
 * "keep native <select> behavior, just re-skinned" decision). A native
 * `<select>` can't render icon children directly, so this wraps it in a
 * positioning container and layers a real lucide `ChevronDown` on top
 * instead of the sitewide data-URI background-image chevron in
 * global.css — same visual slot, but a real icon component that reads
 * `currentColor`/CSS `color` instead of a baked-in hex, and (per an
 * earlier rendering bug report) avoids whatever it was about the
 * data-URI + `appearance: none` combination that could smear/tile in some
 * rendering engines.
 *
 * The chevron is `pointer-events: none` and absolutely positioned over the
 * select's own reserved padding-right space, so it never blocks clicks —
 * every click still lands on the native <select> underneath, which is what
 * keeps native keyboard/opening/selecting behavior intact.
 *
 * Not for `select[multiple]` — those intentionally keep plain native
 * listbox rendering with no chevron (a trailing chevron makes no sense on
 * a scrollable multi-row box). Don't wrap those with this component.
 */
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="select-wrapper">
      <select className={className} {...props} />
      <ChevronDown className="select-wrapper__chevron" size={16} aria-hidden="true" />
    </div>
  );
}
