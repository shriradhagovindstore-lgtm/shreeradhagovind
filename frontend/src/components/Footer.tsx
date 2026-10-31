import { Link, useLocation } from "@tanstack/react-router";
import {
  Youtube,
  Instagram,
  Facebook,
  Mail,
  Phone,
  MapPin,
  MessageCircle,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { buildDefaultWhatsAppUrl } from "@/lib/whatsapp";
import { FooterDiwaliRangoli } from "@/components/DiwaliDecoration";

const logo = "/brand-logo-112.png";

export function Footer() {
  const { settings, user } = useStore();
  const location = useLocation();
  const isCheckoutPage = location.pathname.startsWith("/checkout");

  // On mobile checkout (< lg), elevate WhatsApp above the sticky payment bar so it never overlaps Total Amount or CTA:
  const waPositionClasses = isCheckoutPage
    ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-5 left-4 sm:left-5"
    : "bottom-5 left-5";

  return (
    <footer className="mt-12 shrink-0 border-t border-[#E7E1D6] bg-[#FFFFF4] text-[#2B211C]">
      {/* Symmetrical Seasonal Diwali Rangoli Motif */}
      <FooterDiwaliRangoli />

      {/* 4-Column Main Footer Grid with Natural Height */}
      <div className="container-app grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
        {/* Column 1: Brand */}
        <div className="flex flex-col">
          <Link to="/" className="flex items-center gap-3">
            <img
              src={logo}
              alt={settings.siteName}
              loading="lazy"
              decoding="async"
              width={52}
              height={52}
              className="h-13 w-13 rounded-full border border-[#E7E1D6] bg-white object-contain p-0.5 shadow-sm"
            />
            <span className="font-serif text-xl font-semibold leading-tight text-[#2B211C]">
              {settings.siteName}
            </span>
          </Link>
          <p className="mt-4 text-xs leading-relaxed text-[#6A605A]">
            Authentic Tulsi malas, pooja essentials, poshak, shringar and sacred devotional items thoughtfully sourced and delivered with devotion from Vrindavan.
          </p>
          <div className="mt-6 flex items-center gap-2.5">
            <Social
              href="https://youtube.com/@shriradhagovindstore?si=mXapbranPLnBCYsj"
              label="YouTube"
              icon={Youtube}
            />
            <Social
              href="https://www.instagram.com/shriradhagovind_store?stkn=ZjZhYjVtNjV0bDYz"
              label="Instagram"
              icon={Instagram}
            />
            <Social
              href="https://www.facebook.com/profile.php?id=61580313882838"
              label="Facebook"
              icon={Facebook}
            />
            <a
              href={buildDefaultWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp Support"
              className="grid h-9 w-9 place-items-center rounded-xl border border-[#E7E1D6] bg-white text-[#166F77] transition hover:border-[#D9A441] hover:bg-[#F8F4EC]"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
          </div>
          <p className="mt-5 text-[11px] text-[#6A605A]">
            Directly supporting traditional Vrindavan artisans and Braj seva.
          </p>
        </div>

        {/* Column 2: Shop */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-[#166F77]">
            Shop
          </h3>
          <ul className="mt-4 space-y-2.5 text-xs text-[#6A605A]">
            <li>
              <Link to="/shop" className="transition hover:text-[#166F77]">
                All Products
              </Link>
            </li>
            <li>
              <Link
                to="/shop"
                search={{ cat: "Tulsi Mala" } as never}
                className="transition hover:text-[#166F77]"
              >
                Tulsi Mala
              </Link>
            </li>
            <li>
              <Link
                to="/shop"
                search={{ cat: "Puja Essentials" } as never}
                className="transition hover:text-[#166F77]"
              >
                Puja Items & Essentials
              </Link>
            </li>
            <li>
              <Link
                to="/shop"
                search={{ cat: "Chandan & Tilak" } as never}
                className="transition hover:text-[#166F77]"
              >
                Chandan & Tilak
              </Link>
            </li>
            <li>
              <Link
                to="/shop"
                search={{ cat: "Itra & Fragrance" } as never}
                className="transition hover:text-[#166F77]"
              >
                Itra & Fragrance
              </Link>
            </li>
            <li>
              <Link to="/wishlist" className="transition hover:text-[#166F77]">
                Wishlist
              </Link>
            </li>
            <li>
              <Link to="/track" className="transition hover:text-[#166F77]">
                Track Order
              </Link>
            </li>
          </ul>
        </div>

        {/* Column 3: Help & Policies */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-[#166F77]">
            Help & Policies
          </h3>
          <ul className="mt-4 space-y-2.5 text-xs text-[#6A605A]">
            <li>
              <Link to="/about" className="transition hover:text-[#166F77]">
                About Us
              </Link>
            </li>
            <li>
              <Link to="/contact" className="transition hover:text-[#166F77]">
                Contact Us
              </Link>
            </li>
            <li>
              <Link to="/support" className="transition hover:text-[#166F77]">
                Help Center & Support
              </Link>
            </li>
            <li>
              <Link to="/shipping" className="transition hover:text-[#166F77]">
                Shipping Policy
              </Link>
            </li>
            <li>
              <Link to="/returns" className="transition hover:text-[#166F77]">
                Returns & Refund Policy
              </Link>
            </li>
            <li>
              <Link to="/privacy" className="transition hover:text-[#166F77]">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link to="/terms" className="transition hover:text-[#166F77]">
                Terms & Conditions
              </Link>
            </li>
            <li>
              <Link to="/blog" className="transition hover:text-[#166F77]">
                Devotional Blog & Articles
              </Link>
            </li>
          </ul>
        </div>

        {/* Column 4: Account & Contact */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-[#166F77]">
            Account & Contact
          </h3>
          <ul className="mt-4 space-y-2.5 text-xs text-[#6A605A]">
            <li>
              <Link
                to={user ? "/profile" : "/login"}
                className="font-semibold text-[#2B211C] transition hover:text-[#166F77]"
              >
                {user ? "Your Profile" : "Login / Sign Up"}
              </Link>
            </li>
            <li>
              <Link to={user ? "/orders" : "/login"} className="transition hover:text-[#166F77]">
                Your Orders
              </Link>
            </li>
            <li>
              <Link to="/cart" className="transition hover:text-[#166F77]">
                Shopping Cart
              </Link>
            </li>
            <li>
              <Link to="/profile" className="transition hover:text-[#166F77]">
                Saved Addresses
              </Link>
            </li>
          </ul>

          <address className="mt-5 space-y-2.5 border-t border-[#E7E1D6]/80 pt-4 text-xs not-italic text-[#6A605A]">
            <p className="flex items-start gap-2">
              <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#166F77]" />
              <a href="tel:+917500533505" className="hover:text-[#166F77]">
                +91 7500533505
              </a>
            </p>
            <p className="flex items-start gap-2">
              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#166F77]" />
              <a href={`mailto:${settings.supportEmail}`} className="break-all hover:text-[#166F77]">
                {settings.supportEmail}
              </a>
            </p>
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#166F77]" />
              <span>155, 2nd Floor, Madan Mohan Ghera, Vrindavan, Mathura, UP 281121</span>
            </p>
          </address>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-[#E7E1D6] bg-[#166F77] text-white">
        <div className="container-app flex flex-wrap items-center justify-between gap-3 py-4 text-xs text-white/90">
          <span>
            Copyright {new Date().getFullYear()} {settings.siteName}. All rights reserved.
          </span>
          <span>GSTIN: 09CHYPN5573J1Z9 | Secure payments by Razorpay</span>
        </div>
      </div>

      {/* Floating WhatsApp Button */}
      <a
        href={buildDefaultWhatsAppUrl()}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat on WhatsApp"
        className={`whatsapp-bounce fixed ${waPositionClasses} z-40 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-[0_12px_30px_-10px_rgba(37,211,102,.8)] transition hover:scale-110 hover:bg-[#20bd5a]`}
      >
        <svg viewBox="0 0 32 32" aria-hidden="true" className="h-8 w-8 fill-current">
          <path d="M16.04 3C9.39 3 4 8.27 4 14.77c0 2.3.68 4.55 1.96 6.47L4 28l6.95-1.82a12.2 12.2 0 0 0 5.08 1.1h.01c6.64 0 12.05-5.28 12.05-11.76C28.09 9.02 22.69 3 16.04 3Zm0 21.98h-.01a9.9 9.9 0 0 1-5.04-1.35l-.36-.21-4.12 1.08 1.1-4.02-.23-.37a9.46 9.46 0 0 1-1.5-5.34c0-5.23 4.56-9.48 10.17-9.48 5.6 0 10.16 4.25 10.16 9.48 0 5.23-4.56 10.21-10.17 10.21Zm5.58-7.66c-.3-.15-1.8-.87-2.08-.97-.28-.1-.48-.15-.69.15-.2.3-.79.97-.97 1.17-.18.2-.36.23-.66.08-.31-.15-1.29-.47-2.46-1.49a9.22 9.22 0 0 1-1.7-2.06c-.18-.3-.02-.46.13-.61.14-.14.31-.36.46-.54.15-.18.2-.31.31-.51.1-.2.05-.38-.03-.54-.08-.15-.69-1.62-.94-2.22-.25-.6-.5-.51-.69-.52h-.58c-.2 0-.53.08-.81.38-.28.31-1.06 1.02-1.06 2.48s1.09 2.87 1.24 3.08c.15.2 2.14 3.2 5.2 4.49.72.31 1.29.49 1.73.63.73.23 1.39.2 1.91.12.58-.09 1.8-.72 2.05-1.41.25-.69.25-1.28.18-1.41-.08-.13-.28-.2-.59-.35Z" />
        </svg>
      </a>
    </footer>
  );
}

function Social({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="grid h-9 w-9 place-items-center rounded-xl border border-[#E7E1D6] bg-white text-[#166F77] transition hover:border-[#D9A441] hover:bg-[#F8F4EC]"
    >
      <Icon className="h-4 w-4" />
    </a>
  );
}
