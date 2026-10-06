import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  Heart,
  LogOut,
  Menu,
  Newspaper,
  Package,
  Search,
  ShoppingCart,
  User,
  X,
} from "lucide-react";
import { useEffect, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { useStore, type Category } from "@/lib/store";

const logo = "/brand-logo-112.png";

export function Header() {
  const { cart, wishlist, user, settings, categoryTree, logout } = useStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [expandedDrawer, setExpandedDrawer] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const navigate = useNavigate();
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const firstName = user?.name.split(" ")[0] || "devotee";

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [drawerOpen]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    navigate({ to: "/shop", search: { q: query } as never });
    setMobileOpen(false);
  };

  const closeMenus = () => {
    setOpenCategory(null);
    setAccountOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#E7E1D6] bg-[#FFFFF4]/98 shadow-[0_1px_4px_rgba(43,33,28,0.03)] backdrop-blur-md">
      <div className="text-[#2B211C]">
        <div className="container-app flex min-h-[74px] flex-wrap items-center gap-3 py-3 sm:flex-nowrap sm:gap-5">
          <button
            onClick={() => setDrawerOpen(true)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[#E7E1D6] bg-[#FFFFF4] text-[#2B211C] transition hover:bg-[#F8F4EC] lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link
            to="/"
            onClick={closeMenus}
            className="flex shrink-0 items-center rounded-lg p-1 transition hover:bg-[#F8F4EC]"
            aria-label="Shri Radha Govind Store home"
          >
            <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-full border border-[#E7E1D6] bg-white shadow-sm">
              <img
                src={logo}
                srcSet="/brand-logo-56.png 56w, /brand-logo-112.png 112w, /brand-logo-168.png 168w"
                sizes="56px"
                width={56}
                height={56}
                alt="Shri Radha Govind Store"
                className="h-full w-full object-contain"
              />
            </span>
          </Link>

          <nav
            className="ml-auto flex shrink-0 items-center gap-0.5 min-[360px]:gap-1 text-[#2B211C] lg:hidden"
            aria-label="Mobile account links"
          >
            <MobileNavIcon to={user ? "/profile" : "/login"} label="Account" icon={User} />
            <MobileNavIcon to={user ? "/orders" : "/login"} label="Orders" icon={Package} />
            <MobileNavIcon to="/wishlist" label="Wishlist" icon={Heart} count={wishlist.length} />
            <MobileNavIcon to="/cart" label="Cart" icon={ShoppingCart} count={cartCount} />
          </nav>

          <form
            onSubmit={submit}
            className="order-last flex h-11 w-full overflow-hidden rounded-lg border border-[#E7E1D6] bg-white text-[#2B211C] shadow-sm transition focus-within:border-[#166F77] focus-within:ring-2 focus-within:ring-[#166F77]/10 sm:order-none sm:flex-1"
          >
            <select
              aria-label="Search category"
              className="hidden w-32 border-r border-[#E7E1D6] bg-[#F8F4EC] px-2 text-xs font-medium text-[#2B211C] outline-none md:block"
            >
              <option>All Categories</option>
              {categoryTree.map((category) => (
                <option key={category.id}>{category.name}</option>
              ))}
            </select>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Tulsi mala, puja essentials, itra..."
              className="min-w-0 flex-1 bg-transparent px-4 text-sm outline-none placeholder:text-[#6A605A]"
            />
            <button
              className="grid w-14 place-items-center bg-[#166F77] text-white transition hover:bg-[#135E65]"
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </button>
          </form>

          <nav className="ml-auto hidden shrink-0 items-center gap-1.5 lg:flex">
            <div
              className="relative"
              onMouseEnter={() => setAccountOpen(true)}
              onMouseLeave={() => setAccountOpen(false)}
            >
              <button
                onClick={() => setAccountOpen((value) => !value)}
                className="rounded-lg px-3 py-2 text-left transition hover:bg-[#F8F4EC]"
              >
                <span className="block text-[11px] font-medium text-[#6A605A]">
                  {user ? `Hello, ${firstName}` : "Welcome"}
                </span>
                <strong className="flex items-center gap-1 text-sm font-semibold text-[#2B211C]">
                  {user ? "Account & Orders" : "Sign In / Register"}{" "}
                  <ChevronDown className="h-3.5 w-3.5 text-[#6A605A]" />
                </strong>
              </button>
              {accountOpen && (
                <AccountMenu
                  user={!!user}
                  wishlistCount={wishlist.length}
                  onClose={() => setAccountOpen(false)}
                  onLogout={() => logout()}
                />
              )}
            </div>
            <Link
              to={user ? "/orders" : "/login"}
              className="rounded-lg px-3 py-2 transition hover:bg-[#F8F4EC]"
            >
              <span className="block text-[11px] font-medium text-[#6A605A]">Track</span>
              <strong className="text-sm font-semibold text-[#2B211C]">Orders</strong>
            </Link>
            <Link
              to="/wishlist"
              className="relative grid h-11 w-11 place-items-center rounded-lg text-[#2B211C] transition hover:bg-[#F8F4EC]"
              aria-label="Wishlist"
            >
              <Heart className="h-5 w-5" />
              {wishlist.length > 0 && <Badge>{wishlist.length}</Badge>}
            </Link>
            <Link
              to="/cart"
              className="relative flex h-11 items-center gap-2 rounded-lg bg-[#166F77]/10 px-3 text-[#166F77] transition hover:bg-[#166F77]/15"
            >
              <ShoppingCart className="h-5 w-5" />
              <strong className="text-sm font-semibold">Cart</strong>
              {cartCount > 0 && <Badge>{cartCount}</Badge>}
            </Link>
          </nav>
        </div>
      </div>

      <div className="border-t border-[#E7E1D6] bg-[#FFFFF4] text-[#2B211C]">
        <div className="container-app flex h-9 sm:h-10 items-center gap-0.5 sm:gap-1 overflow-x-auto lg:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex h-7 sm:h-8 shrink-0 items-center gap-1 sm:gap-1.5 rounded-md px-2 sm:px-2.5 text-[11px] sm:text-sm font-semibold text-[#166F77] hover:bg-[#F8F4EC] transition"
          >
            <Menu className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span>All</span>
          </button>
          <Shortcut label="Sacred Picks" search="sacred-picks" />
          {categoryTree.map((category) => (
            <div
              key={category.id}
              className="relative shrink-0 flex items-center h-9 sm:h-10 group"
              onMouseEnter={() => setOpenCategory(category.id)}
              onMouseLeave={() => setOpenCategory(null)}
            >
              <div className="flex items-center rounded-md hover:bg-[#F8F4EC] transition">
                <Link
                  to="/shop"
                  search={{ cat: category.name } as never}
                  onClick={() => setOpenCategory(null)}
                  className="px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-[13px] font-medium text-[#2B211C] hover:text-[#166F77] transition whitespace-nowrap"
                >
                  {category.name}
                </Link>
                {category.children.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setOpenCategory((prev) => (prev === category.id ? null : category.id));
                    }}
                    className="pr-1.5 sm:pr-2 pl-0.5 py-0.5 sm:py-1 text-[#6A605A] hover:text-[#166F77] transition"
                    aria-label={`Toggle ${category.name} dropdown`}
                  >
                    <ChevronDown
                      className={`h-2.5 w-2.5 sm:h-3 sm:w-3 transition-transform duration-200 ${
                        openCategory === category.id ? "rotate-180 text-[#166F77]" : ""
                      }`}
                    />
                  </button>
                )}
              </div>

              {openCategory === category.id && category.children.length > 0 && (
                <div
                  className="absolute left-0 top-full z-50 pt-1 pointer-events-auto"
                  onMouseEnter={() => setOpenCategory(category.id)}
                  onMouseLeave={() => setOpenCategory(null)}
                >
                  <MegaMenu category={category} onClose={() => setOpenCategory(null)} />
                </div>
              )}
            </div>
          ))}
          <Link
            to="/blog"
            className="flex shrink-0 h-7 sm:h-8 items-center gap-1 sm:gap-1.5 rounded-md px-2 sm:px-2.5 text-[11px] sm:text-[13px] font-medium text-[#166F77] hover:text-[#135E65] hover:bg-[#F8F4EC] transition whitespace-nowrap"
          >
            <Newspaper className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Devotional Blog
          </Link>
        </div>
      </div>

      {settings.announcement && (
        <div className="border-t border-[#E7E1D6] bg-[#F8F4EC] px-4 py-1.5 text-center text-xs font-medium text-[#2B211C]">
          <span className="line-clamp-1">{settings.announcement}</span>
        </div>
      )}

      <AllDrawer
        open={drawerOpen}
        categories={categoryTree}
        expanded={expandedDrawer}
        setExpanded={setExpandedDrawer}
        userName={user ? firstName : "devotee"}
        isLoggedIn={!!user}
        onClose={() => setDrawerOpen(false)}
      />
    </header>
  );
}

function Shortcut({ label, search }: { label: string; search: string }) {
  return (
    <Link
      to="/shop"
      search={{ q: search } as never}
      className="flex h-7 sm:h-8 shrink-0 items-center rounded-md px-1.5 sm:px-2.5 text-[11px] sm:text-[13px] font-medium text-[#2B211C] hover:text-[#166F77] hover:bg-[#F8F4EC] transition whitespace-nowrap"
    >
      {label}
    </Link>
  );
}

function MobileNavIcon({
  to,
  label,
  icon: Icon,
  count,
}: {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  count?: number;
}) {
  return (
    <Link
      to={to}
      className="relative grid h-10 w-9 min-[360px]:w-10 place-items-center rounded-lg text-[#2B211C] hover:bg-[#F8F4EC] active:bg-[#F8F4EC] transition"
      aria-label={label}
    >
      <Icon className="h-5 w-5" />
      {!!count && <Badge>{count}</Badge>}
    </Link>
  );
}

function MegaMenu({
  category,
  onClose,
}: {
  category: Category & { children: Category[] };
  onClose: () => void;
}) {
  return (
    <div className="w-52 rounded-lg border border-[#E7E1D6] bg-white p-2.5 text-[#2B211C] shadow-xl">
      <div className="border-b border-[#E7E1D6]/70 px-2.5 pb-2 mb-1">
        <Link
          to="/shop"
          search={{ cat: category.name } as never}
          onClick={onClose}
          className="text-xs font-bold uppercase tracking-wider text-[#166F77] hover:underline block"
        >
          {category.name}
        </Link>
      </div>

      <div className="flex flex-col space-y-0.5 max-h-[300px] overflow-y-auto [scrollbar-width:none]">
        {category.children.map((child) => (
          <Link
            key={child.id}
            to="/shop"
            search={{ cat: child.name } as never}
            onClick={onClose}
            className="block rounded-md px-2.5 py-1.5 text-xs font-medium text-[#2B211C] hover:bg-[#F8F4EC] hover:text-[#166F77] transition"
          >
            {child.name}
          </Link>
        ))}
      </div>

      <div className="mt-1 pt-1.5 border-t border-[#E7E1D6]/70 px-2.5">
        <Link
          to="/shop"
          search={{ cat: category.name } as never}
          onClick={onClose}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#166F77] hover:underline"
        >
          <span>View All</span>
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function AllDrawer({
  open,
  categories,
  expanded,
  setExpanded,
  userName,
  isLoggedIn,
  onClose,
}: {
  open: boolean;
  categories: (Category & { children: Category[] })[];
  expanded: string | null;
  setExpanded: (id: string | null | ((prev: string | null) => string | null)) => void;
  userName: string;
  isLoggedIn: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] h-dvh overflow-hidden bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="All store categories"
        className="h-dvh max-h-dvh w-[min(88vw,340px)] overflow-y-auto overscroll-contain bg-[#FFFFF4] text-[#2B211C] shadow-2xl flex flex-col justify-between"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div>
          <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-[#E7E1D6] bg-[#166F77] px-4 text-white">
            <Link
              to={isLoggedIn ? "/profile" : "/login"}
              onClick={onClose}
              className="flex items-center gap-2.5 text-sm font-semibold"
            >
              <User className="h-5 w-5" />
              <span>{isLoggedIn ? `Hello, ${userName}` : "Sign In / Register"}</span>
            </Link>
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="border-b border-[#E7E1D6]/70 bg-white px-4 py-2.5">
            <Link
              to="/shop"
              onClick={onClose}
              className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#166F77] hover:underline"
            >
              <span>Explore All Products</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <DrawerSection title="Shop by Category">
            {categories.map((category) => (
              <div key={category.id} className="border-b border-[#E7E1D6]/50 last:border-b-0">
                <div className="flex items-center justify-between hover:bg-[#F8F4EC] transition">
                  <Link
                    to="/shop"
                    search={{ cat: category.name } as never}
                    onClick={onClose}
                    className="flex-1 px-4 py-2.5 text-xs sm:text-sm font-medium text-[#2B211C] hover:text-[#166F77]"
                  >
                    {category.name}
                  </Link>
                  {category.children.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => (prev === category.id ? null : category.id))}
                      className="px-3 py-2.5 text-[#166F77] hover:bg-[#E7E1D6]/40 transition"
                      aria-label={`Toggle ${category.name} subcategories`}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform duration-200 ${
                          expanded === category.id ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  )}
                </div>
                {expanded === category.id && category.children.length > 0 && (
                  <div className="bg-[#FAF4EE] py-1.5 pl-6 pr-3 space-y-0.5 border-t border-[#E7E1D6]/40">
                    {category.children.map((child) => (
                      <Link
                        key={child.id}
                        to="/shop"
                        search={{ cat: child.name } as never}
                        onClick={onClose}
                        className="flex items-center gap-2 py-1.5 px-2 text-xs font-medium text-[#6A605A] hover:text-[#166F77] hover:bg-white/60 rounded transition"
                      >
                        <span className="h-1 w-1 rounded-full bg-[#D9A441]" />
                        <span>{child.name}</span>
                      </Link>
                    ))}
                    <Link
                      to="/shop"
                      search={{ cat: category.name } as never}
                      onClick={onClose}
                      className="flex items-center gap-1 py-1.5 px-2 text-xs font-semibold text-[#166F77] hover:underline"
                    >
                      See all in {category.name} →
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </DrawerSection>

          <DrawerSection title="Account & Support">
            <Link
              to={isLoggedIn ? "/orders" : "/login"}
              onClick={onClose}
              className="block px-4 py-2.5 text-xs font-medium text-[#2B211C] hover:bg-[#F8F4EC]"
            >
              Your Orders
            </Link>
            <Link
              to="/wishlist"
              onClick={onClose}
              className="block px-4 py-2.5 text-xs font-medium text-[#2B211C] hover:bg-[#F8F4EC]"
            >
              Your Wishlist
            </Link>
            <Link
              to="/cart"
              onClick={onClose}
              className="block px-4 py-2.5 text-xs font-medium text-[#2B211C] hover:bg-[#F8F4EC]"
            >
              Shopping Cart
            </Link>
            <Link
              to="/contact"
              onClick={onClose}
              className="block px-4 py-2.5 text-xs font-medium text-[#2B211C] hover:bg-[#F8F4EC]"
            >
              Customer Support & Contact
            </Link>
          </DrawerSection>
        </div>
      </aside>
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-[#E7E1D6] py-2">
      <h2 className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#166F77]">{title}</h2>
      {children}
    </section>
  );
}

function AccountMenu({
  user,
  wishlistCount,
  onClose,
  onLogout,
}: {
  user: boolean;
  wishlistCount: number;
  onClose: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="absolute right-0 top-full z-50 w-64 rounded-lg border bg-white p-2 text-foreground shadow-2xl">
      <p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Your account
      </p>
      {user ? (
        <>
          <AccountLink to="/profile" icon={User} label="Profile & address" onClick={onClose} />
          <AccountLink to="/orders" icon={Package} label="Your orders" onClick={onClose} />
          <AccountLink
            to="/wishlist"
            icon={Heart}
            label={`Wishlist (${wishlistCount})`}
            onClick={onClose}
          />
          <button
            onClick={() => {
              onLogout();
              onClose();
            }}
            className="mt-1 flex w-full items-center gap-3 border-t px-3 py-3 text-sm font-medium text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </>
      ) : (
        <AccountLink to="/login" icon={User} label="Login / Sign Up" onClick={onClose} />
      )}
    </div>
  );
}

function AccountLink({
  to,
  icon: Icon,
  label,
  onClick,
}: {
  to: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-muted"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="absolute right-0 top-0 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
      {children}
    </span>
  );
}
