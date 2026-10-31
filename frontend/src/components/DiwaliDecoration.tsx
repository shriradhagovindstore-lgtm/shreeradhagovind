import { useLocation } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { FESTIVE_THEME_CONFIG, isDiwaliThemeActive } from "@/lib/festiveTheme";

/**
 * Brass Diya SVG Component
 * Traditional Indian temple lamp with detailed Paada base, brass bowl,
 * cotton wick, layered golden flame, and warm ambient light aura.
 */
function BrassDiya({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 44"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        {/* Metallic brass gradient for the diya bowl */}
        <linearGradient id="diwali-brass" x1="6" y1="21" x2="42" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#DFB257" />
          <stop offset="28%" stopColor="#FDE69E" />
          <stop offset="55%" stopColor="#C9972E" />
          <stop offset="85%" stopColor="#8A6116" />
          <stop offset="100%" stopColor="#5E400B" />
        </linearGradient>

        {/* Highlight for the top rim */}
        <linearGradient id="diwali-rim" x1="8" y1="20" x2="40" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F9E29D" />
          <stop offset="50%" stopColor="#FFF9E0" />
          <stop offset="100%" stopColor="#C9972E" />
        </linearGradient>

        {/* Oil reservoir depth */}
        <radialGradient id="diwali-oil" cx="24" cy="23" r="14" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#69460D" />
          <stop offset="65%" stopColor="#4A2E05" />
          <stop offset="100%" stopColor="#2E1B02" />
        </radialGradient>

        {/* Outer vibrant saffron/orange flame */}
        <linearGradient id="diwali-flame-out" x1="24" y1="3" x2="24" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF3D00" />
          <stop offset="40%" stopColor="#FF7A00" />
          <stop offset="85%" stopColor="#FFB300" />
          <stop offset="100%" stopColor="#FF6F00" />
        </linearGradient>

        {/* Inner radiant golden flame */}
        <linearGradient id="diwali-flame-in" x1="24" y1="7" x2="24" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF3B0" />
          <stop offset="35%" stopColor="#FFDE59" />
          <stop offset="80%" stopColor="#FFB800" />
          <stop offset="100%" stopColor="#FF8F00" />
        </linearGradient>

        {/* Flame radial ambient halo */}
        <radialGradient id="diwali-halo" cx="24" cy="13" r="14" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFB300" stopOpacity="0.45" />
          <stop offset="50%" stopColor="#FF8F00" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#FF6F00" stopOpacity="0" />
        </radialGradient>

        {/* Ground light pool */}
        <radialGradient id="diwali-ground" cx="24" cy="40" r="18" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D9A441" stopOpacity="0.4" />
          <stop offset="60%" stopColor="#D9A441" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#D9A441" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 1. Ground Light Pool */}
      <ellipse cx="24" cy="40" rx="18" ry="3.5" fill="url(#diwali-ground)" />

      {/* 2. Pedestal Base (Paada) with stepped rings */}
      <path
        d="M 16.5 40 C 17.5 37 19.5 35.5 24 35.5 C 28.5 35.5 30.5 37 31.5 40 Z"
        fill="#8A6116"
      />
      <path
        d="M 17.5 39.5 C 18.5 37.5 20 36.5 24 36.5 C 28 36.5 29.5 37.5 30.5 39.5 Z"
        fill="#C9972E"
      />
      <rect x="21" y="32" width="6" height="4" rx="1" fill="#A87B1E" />
      <ellipse cx="24" cy="32.5" rx="4.5" ry="1.2" fill="#FDE69E" />

      {/* 3. Traditional Brass Bowl Body */}
      <path
        d="M 7 24 C 8.5 32.5 16.5 34.5 24 34.5 C 31.5 34.5 39.5 32.5 41 24 C 42.5 21 38 21 33 22 C 27.5 23 20.5 23 15 22 C 10 21 5.5 21 7 24 Z"
        fill="url(#diwali-brass)"
        stroke="#5E400B"
        strokeWidth="0.5"
      />

      {/* Polished Rim Highlight */}
      <ellipse cx="24" cy="22" rx="16.5" ry="3" fill="url(#diwali-rim)" opacity="0.9" />

      {/* Oil Pool */}
      <ellipse cx="24" cy="22.6" rx="13.5" ry="2" fill="url(#diwali-oil)" />

      {/* 4. Cotton Wick (Baati) */}
      <path
        d="M 23.2 22 C 23.5 19.5 23.9 17.8 24 16.5 C 24.1 17.8 24.5 19.5 24.8 22 Z"
        fill="#2E1B02"
      />
      <circle cx="24" cy="16.8" r="0.75" fill="#FF5722" />

      {/* 5. Flame Ambient Halo (Pulsing) */}
      <circle
        cx="24"
        cy="13"
        r="13"
        fill="url(#diwali-halo)"
        className="diwali-aura-pulse"
      />

      {/* 6. Sacred Flame (Flickering) */}
      <g className="diwali-flame-anim" style={{ transformOrigin: "24px 18px" }}>
        <path
          d="M 24 3 C 20 8.5 18.2 13 19.2 16.2 C 20.2 18.8 22 19.4 24 19.4 C 26 19.4 27.8 18.8 28.8 16.2 C 29.8 13 28 8.5 24 3 Z"
          fill="url(#diwali-flame-out)"
        />
        <path
          d="M 24 6.5 C 21.6 10.8 20.8 13.5 21.5 16 C 22 17.5 22.9 18 24 18 C 25.1 18 26 17.5 26.5 16 C 27.2 13.5 26.4 10.8 24 6.5 Z"
          fill="url(#diwali-flame-in)"
        />
        <path
          d="M 24 9.5 C 22.9 12.2 22.6 14 23 15.3 C 23.3 16.2 23.6 16.6 24 16.6 C 24.4 16.6 24.7 16.2 25 15.3 C 25.4 14 25.1 12.2 24 9.5 Z"
          fill="#FFFDF4"
        />
      </g>
    </svg>
  );
}

/**
 * Fairy Lights Garland Row
 * Renders a lightweight, seamless garland across the top edge.
 */
function FairyLightsRow() {
  const garlandUnits = Array.from({ length: 44 }, (_, i) => i);

  return (
    <div
      className="fixed top-0 inset-x-0 z-50 pointer-events-none select-none overflow-hidden h-6 sm:h-7"
      aria-hidden="true"
    >
      <div className="flex w-[2112px] sm:w-[2200px] items-start justify-start">
        {garlandUnits.map((idx) => {
          const isEven = idx % 2 === 0;
          return (
            <div key={idx} className="relative shrink-0 w-12 h-6 sm:h-7">
              <svg viewBox="0 0 48 24" className="w-full h-full overflow-visible" fill="none">
                <path
                  d="M 0 0 C 14 9 34 9 48 0"
                  stroke="rgba(140, 109, 54, 0.45)"
                  strokeWidth="0.85"
                />
                <rect x="23" y="6.2" width="2" height="2.2" rx="0.5" fill="#8C6D36" />
                <ellipse
                  cx="24"
                  cy="11.2"
                  rx="3.2"
                  ry="4"
                  className={isEven ? "diwali-bulb-a" : "diwali-bulb-b"}
                />
                <circle cx="24" cy="10.8" r="1.1" fill="#FFFDF0" opacity="0.9" />
              </svg>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Header Festive Toran Component
 * Traditional Indian marigold (Genda Phool) and mango-leaf (Aam ke Patte) bandhanwar
 * positioned immediately below the header.
 */
export function HeaderToran() {
  const location = useLocation();
  const { settings } = useStore();

  if (location.pathname.startsWith("/admin")) return null;
  if (!isDiwaliThemeActive(settings?.diwaliThemeEnabled, settings?.diwaliThemeExpiry)) return null;
  if (!FESTIVE_THEME_CONFIG.showToran) return null;

  // 36 repeating toran units of 60px width = 2160px (covers all desktop & 4K screens)
  const toranUnits = Array.from({ length: 36 }, (_, i) => i);

  return (
    <div
      className="w-full overflow-hidden select-none pointer-events-none h-3.5 sm:h-4.5 bg-[#FFFFF4] border-t border-[#E7E1D6]/50 -mt-px relative z-30"
      aria-hidden="true"
    >
      <div className="flex w-[2160px] items-start justify-start">
        {toranUnits.map((idx) => (
          <div key={idx} className="relative shrink-0 w-[60px] h-3.5 sm:h-4.5">
            <svg viewBox="0 0 60 18" className="w-full h-full overflow-visible" fill="none">
              <defs>
                {/* Mango Leaf Green Gradient */}
                <linearGradient id={`toran-leaf-${idx % 2}`} x1="0" y1="0" x2="0" y2="18" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor={idx % 2 === 0 ? "#2E7D32" : "#388E3C"} />
                  <stop offset="50%" stopColor={idx % 2 === 0 ? "#1B5E20" : "#2E7D32"} />
                  <stop offset="100%" stopColor="#144A18" />
                </linearGradient>

                {/* Saffron Marigold Gradient */}
                <radialGradient id={`marigold-orange-${idx % 2}`} cx="29" cy="7" r="5" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#FFE082" />
                  <stop offset="35%" stopColor="#FFA000" />
                  <stop offset="70%" stopColor="#F57C00" />
                  <stop offset="100%" stopColor="#D84315" />
                </radialGradient>

                {/* Yellow Marigold Gradient */}
                <radialGradient id={`marigold-yellow-${idx % 2}`} cx="59" cy="7" r="5" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#FFF9C4" />
                  <stop offset="35%" stopColor="#FFEE58" />
                  <stop offset="70%" stopColor="#FBC02D" />
                  <stop offset="100%" stopColor="#F57F17" />
                </radialGradient>
              </defs>

              {/* Braided Top Golden Hanging Cord */}
              <line x1="0" y1="2" x2="60" y2="2" stroke="#D9A441" strokeWidth="1.2" strokeDasharray="3 1" />

              {/* Mango Leaf 1 (Left slant) */}
              <path
                d="M 15 2 C 12 5.5 10 10 14 16 C 16.5 10 17 5.5 15 2 Z"
                fill={`url(#toran-leaf-${idx % 2})`}
              />
              <path d="M 15 2 C 14 6 13.5 11 14 15" stroke="#81C784" strokeWidth="0.4" strokeOpacity="0.8" />
              <circle cx="14" cy="16" r="0.75" fill="#D9A441" />

              {/* Mango Leaf 2 (Right slant) */}
              <path
                d="M 44 2 C 42 5.5 41 10 45 16 C 47.5 10 47 5.5 44 2 Z"
                fill={`url(#toran-leaf-${idx % 2})`}
              />
              <path d="M 44 2 C 43.5 6 44 11 45 15" stroke="#81C784" strokeWidth="0.4" strokeOpacity="0.8" />
              <circle cx="45" cy="16" r="0.75" fill="#D9A441" />

              {/* Saffron Marigold Flower (Center-Left) */}
              <circle cx="29" cy="6.5" r="4.2" fill={`url(#marigold-orange-${idx % 2})`} />
              <circle cx="29" cy="6.5" r="3" fill="#FB8C00" opacity="0.9" />
              <circle cx="29" cy="6.5" r="1.6" fill="#FFB74D" />
              <circle cx="29" cy="6.5" r="0.7" fill="#FFE082" />

              {/* Yellow Marigold Flower (Segment Joint) */}
              <circle cx="59" cy="6.5" r="3.8" fill={`url(#marigold-yellow-${idx % 2})`} />
              <circle cx="59" cy="6.5" r="2.7" fill="#FDD835" opacity="0.9" />
              <circle cx="59" cy="6.5" r="1.4" fill="#FFF176" />
              <circle cx="59" cy="6.5" r="0.6" fill="#FFFDE7" />
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Homepage Diwali Greeting Component
 * Premium, compact festive banner rendered immediately below the hero section.
 */
export function DiwaliHomepageGreeting() {
  const { settings } = useStore();

  if (!isDiwaliThemeActive(settings?.diwaliThemeEnabled, settings?.diwaliThemeExpiry)) return null;
  if (!FESTIVE_THEME_CONFIG.showGreeting) return null;

  return (
    <section
      className="relative bg-[#FFFFF4] border-b border-[#E7E1D6] py-3.5 sm:py-5 px-4 overflow-hidden select-none"
      aria-label="Diwali Festive Greeting"
    >
      <div className="container-app max-w-3xl mx-auto flex flex-col items-center justify-center text-center">
        {/* Subtle decorative antique gold flourish with center diya motif */}
        <div className="flex items-center justify-center gap-3 w-full max-w-sm mb-1.5 sm:mb-2 opacity-85">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#D9A441]" />
          <svg viewBox="0 0 24 18" className="w-5 h-4 sm:w-6 sm:h-4.5 text-[#D9A441] shrink-0" fill="currentColor">
            {/* Diya Bowl */}
            <path d="M 4 10 C 5 15 10 16.5 12 16.5 C 14 16.5 19 15 20 10 C 21 8.5 18 8.5 15 9 C 12 9.5 8 9.5 5 9 C 3 8.5 3 8.5 4 10 Z" fill="#D9A441" />
            <ellipse cx="12" cy="9" rx="7" ry="1.5" fill="#FFE082" opacity="0.9" />
            {/* Flame */}
            <path d="M 12 2 C 10.5 4.5 9.5 7 10.2 8.5 C 10.8 9.5 11.5 9.8 12 9.8 C 12.5 9.8 13.2 9.5 13.8 8.5 C 14.5 7 13.5 4.5 12 2 Z" fill="#FF6F00" />
            <path d="M 12 4 C 11 5.5 10.5 7 11 8 C 11.3 8.6 11.7 8.8 12 8.8 C 12.3 8.8 12.7 8.6 13 8 C 13.5 7 13 5.5 12 4 Z" fill="#FFD54F" />
          </svg>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#D9A441]" />
        </div>

        {/* Heading: Deep Teal Serif */}
        <h2 className="font-serif text-xl sm:text-2xl md:text-[1.75rem] font-bold text-[#166F77] tracking-wide leading-tight flex items-center justify-center gap-2">
          <span>शुभ दीपावली</span>
          <span className="text-lg sm:text-xl">🪔</span>
        </h2>

        {/* Subtitle: Warm Devotional Blessing */}
        <p className="mt-1 sm:mt-1.5 text-xs sm:text-sm text-[#4A3E37] font-medium italic max-w-lg leading-relaxed">
          May your home be filled with light, happiness and devotion.
        </p>

        {/* Bottom subtle gold accent cluster */}
        <div className="flex items-center gap-1.5 mt-2 opacity-65">
          <span className="h-1 w-1 rounded-full bg-[#D9A441]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#D9A441]" />
          <span className="h-1 w-1 rounded-full bg-[#D9A441]" />
        </div>
      </div>
    </section>
  );
}

/**
 * Footer Festive Rangoli Component
 * Symmetrical traditional rangoli / diya motif placed above the footer links.
 */
export function FooterDiwaliRangoli() {
  const location = useLocation();
  const { settings } = useStore();

  if (location.pathname.startsWith("/admin")) return null;
  if (!isDiwaliThemeActive(settings?.diwaliThemeEnabled, settings?.diwaliThemeExpiry)) return null;
  if (!FESTIVE_THEME_CONFIG.showFooterRangoli) return null;

  return (
    <div
      className="container-app w-full flex items-center justify-center gap-3 pt-6 pb-2 select-none pointer-events-none"
      aria-hidden="true"
    >
      <span className="h-px flex-1 max-w-[120px] sm:max-w-xs bg-gradient-to-r from-transparent to-[#D9A441]/50" />

      {/* Symmetrical Rangoli Motif with Central Lotus and Flanking Diyas */}
      <svg viewBox="0 0 160 36" className="w-36 sm:w-44 h-8 sm:h-9 shrink-0" fill="none">
        <defs>
          <radialGradient id="footer-rangoli-center" cx="80" cy="18" r="14" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFF8E1" />
            <stop offset="45%" stopColor="#FFE082" />
            <stop offset="75%" stopColor="#D9A441" />
            <stop offset="100%" stopColor="#B38628" />
          </radialGradient>
        </defs>

        {/* Left Flanking Diya */}
        <g transform="translate(14, 8) scale(0.65)">
          <path d="M 4 15 C 5 21 11 23 15 23 C 19 23 25 21 26 15 C 27.5 13 23 13 20 14 C 16 15 10 15 7 14 C 4 13 2.5 13 4 15 Z" fill="#D9A441" />
          <ellipse cx="15" cy="14" rx="10" ry="2" fill="#FFE082" opacity="0.8" />
          <path d="M 15 3 C 13 6.5 12 10 13 12 C 13.7 13.5 14.5 14 15 14 C 15.5 14 16.3 13.5 17 12 C 18 10 17 6.5 15 3 Z" fill="#FF7A00" />
          <circle cx="15" cy="10" r="1.8" fill="#FFD54F" />
        </g>

        {/* Central Symmetrical Lotus Rangoli */}
        <circle cx="80" cy="18" r="12" fill="url(#footer-rangoli-center)" opacity="0.18" />

        {/* 8-Petal Symmetrical Rosette */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <path
            key={angle}
            d="M 80 18 C 77 12 83 12 80 6 C 77 12 83 12 80 18 Z"
            fill="#D9A441"
            opacity="0.85"
            transform={`rotate(${angle} 80 18)`}
          />
        ))}

        {/* Inner Ring and Core Dot */}
        <circle cx="80" cy="18" r="3.5" fill="#166F77" />
        <circle cx="80" cy="18" r="1.5" fill="#FFE082" />

        {/* Right Flanking Diya */}
        <g transform="translate(126, 8) scale(0.65)">
          <path d="M 4 15 C 5 21 11 23 15 23 C 19 23 25 21 26 15 C 27.5 13 23 13 20 14 C 16 15 10 15 7 14 C 4 13 2.5 13 4 15 Z" fill="#D9A441" />
          <ellipse cx="15" cy="14" rx="10" ry="2" fill="#FFE082" opacity="0.8" />
          <path d="M 15 3 C 13 6.5 12 10 13 12 C 13.7 13.5 14.5 14 15 14 C 15.5 14 16.3 13.5 17 12 C 18 10 17 6.5 15 3 Z" fill="#FF7A00" />
          <circle cx="15" cy="10" r="1.8" fill="#FFD54F" />
        </g>
      </svg>

      <span className="h-px flex-1 max-w-[120px] sm:max-w-xs bg-gradient-to-l from-transparent to-[#D9A441]/50" />
    </div>
  );
}

/**
 * DiwaliDecoration Component
 * Customer-facing seasonal festive theme with Warm Golden Fairy Lights,
 * Floating Traditional Brass Diyas, and Subtle Ambient Golden Lighting.
 */
export function DiwaliDecoration({ isAuth = false }: { isAuth?: boolean }) {
  const location = useLocation();
  const { settings } = useStore();

  // Safety guard: if inside admin, render absolutely nothing
  if (location.pathname.startsWith("/admin")) return null;
  // Dynamic persistent activation check
  if (!isDiwaliThemeActive(settings?.diwaliThemeEnabled, settings?.diwaliThemeExpiry)) return null;

  // On mobile (< 640px), hide corner diyas on routes that feature sticky bottom action bars
  // (e.g. mobile product detail sticky Add to Cart, mobile checkout sticky pay summary)
  const isProductRoute = location.pathname.startsWith("/product");
  const isCheckoutRoute = location.pathname.startsWith("/checkout");
  const hideDiyasOnMobile = isProductRoute || isCheckoutRoute;

  return (
    <>
      {/* 1. Scoped CSS Animations for Festive Lights and Flame Breathing */}
      <style>{`
        /* Warm golden bulb Phase A breathing animation */
        @keyframes diwaliFairyA {
          0%, 100% {
            opacity: 0.72;
            fill: #FFD54F;
            filter: drop-shadow(0 0 2.5px rgba(255, 179, 0, 0.5)) drop-shadow(0 0 6px rgba(255, 152, 0, 0.3));
          }
          50% {
            opacity: 1;
            fill: #FFE082;
            filter: drop-shadow(0 0 4px rgba(255, 215, 64, 0.85)) drop-shadow(0 0 10px rgba(255, 179, 0, 0.55));
          }
        }

        /* Warm golden bulb Phase B breathing animation (alternating phase) */
        @keyframes diwaliFairyB {
          0%, 100% {
            opacity: 1;
            fill: #FFE082;
            filter: drop-shadow(0 0 4px rgba(255, 215, 64, 0.85)) drop-shadow(0 0 10px rgba(255, 179, 0, 0.55));
          }
          50% {
            opacity: 0.72;
            fill: #FFD54F;
            filter: drop-shadow(0 0 2.5px rgba(255, 179, 0, 0.5)) drop-shadow(0 0 6px rgba(255, 152, 0, 0.3));
          }
        }

        /* Diya Flame Gentle Organic Flicker */
        @keyframes diwaliFlameFlicker {
          0%, 100% {
            transform: scale(1) rotate(0deg);
            opacity: 0.95;
          }
          20% {
            transform: scale(0.97, 1.03) rotate(-1.2deg);
            opacity: 1;
          }
          40% {
            transform: scale(1.02, 0.98) rotate(0.8deg);
            opacity: 0.93;
          }
          65% {
            transform: scale(0.98, 1.02) rotate(-0.5deg);
            opacity: 0.98;
          }
          85% {
            transform: scale(1.01, 0.99) rotate(1deg);
            opacity: 0.94;
          }
        }

        /* Diya Ambient Light Halo Pulsing */
        @keyframes diwaliHaloPulse {
          0%, 100% {
            opacity: 0.55;
            transform: scale(0.94);
          }
          50% {
            opacity: 0.85;
            transform: scale(1.06);
          }
        }

        .diwali-bulb-a {
          animation: diwaliFairyA 2.5s ease-in-out infinite;
          will-change: opacity, filter;
        }

        .diwali-bulb-b {
          animation: diwaliFairyB 2.5s ease-in-out infinite;
          will-change: opacity, filter;
        }

        .diwali-flame-anim {
          animation: diwaliFlameFlicker 2.2s ease-in-out infinite;
          will-change: transform, opacity;
        }

        .diwali-aura-pulse {
          animation: diwaliHaloPulse 2.2s ease-in-out infinite;
          transform-origin: 24px 13px;
          will-change: transform, opacity;
        }

        /* Accessibility: respect user preference for reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .diwali-bulb-a,
          .diwali-bulb-b,
          .diwali-flame-anim,
          .diwali-aura-pulse {
            animation: none !important;
            opacity: 0.88 !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* 2. Top Subtle Golden Ambient Sunburst (Warm Temple Glow) */}
      {FESTIVE_THEME_CONFIG.showAmbientGlow && (
        <div
          className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-32 sm:h-44 pointer-events-none z-0 select-none opacity-45 bg-[radial-gradient(ellipse_at_top,rgba(217,164,65,0.18)_0%,rgba(217,164,65,0.05)_50%,transparent_75%)]"
          aria-hidden="true"
        />
      )}

      {/* 3. Warm Golden Fairy Lights String along the Storefront Upper Edge */}
      {FESTIVE_THEME_CONFIG.showFairyLights && <FairyLightsRow />}

      {/* 4. Floating Decorative Brass Diyas near Lower Left and Lower Right */}
      {FESTIVE_THEME_CONFIG.showDiyas && (
        <>
          {/* Lower Left Traditional Diya */}
          <div
            className={`fixed z-30 pointer-events-none select-none transition-all duration-300 ${
              hideDiyasOnMobile ? "hidden sm:block" : "hidden min-[360px]:block sm:block"
            } bottom-[5.25rem] left-3 sm:bottom-4 sm:left-24 lg:left-28`}
            aria-hidden="true"
            title="Shubh Deepawali"
          >
            <BrassDiya className="w-7 h-7 sm:w-11 sm:h-11 drop-shadow-[0_4px_12px_rgba(217,164,65,0.35)]" />
          </div>

          {/* Lower Right Traditional Diya */}
          <div
            className={`fixed z-30 pointer-events-none select-none transition-all duration-300 ${
              hideDiyasOnMobile ? "hidden sm:block" : "hidden min-[360px]:block sm:block"
            } bottom-[5.25rem] right-3 sm:bottom-4 sm:right-24 lg:right-28`}
            aria-hidden="true"
            title="Shubh Deepawali"
          >
            <BrassDiya className="w-7 h-7 sm:w-11 sm:h-11 drop-shadow-[0_4px_12px_rgba(217,164,65,0.35)]" />
          </div>
        </>
      )}
    </>
  );
}
