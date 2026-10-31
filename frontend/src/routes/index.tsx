import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { DiwaliHomepageGreeting } from "@/components/DiwaliDecoration";
import { ProductCard } from "@/components/ProductCard";
import { GoogleReviewsSection } from "@/components/GoogleReviews/GoogleReviewsSection";
import { InstagramSection } from "@/components/InstagramFeed/InstagramSection";
import { useStore, type Category } from "@/lib/store";
import { type Product } from "@/lib/products";
import heroKrishna from "@/assets/hero-krishna.jpg";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, pageSeo } from "@/lib/seo";
import { API_URL } from "@/lib/api";
import { optimizeImageKit } from "@/lib/image";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const homeHero = "/home-devotional-hero.png";

export function optimizeHeroImage(url: string, width = 800) {
  return optimizeImageKit(url, width, 80);
}

async function loadSettingsHero(): Promise<{ heroImage: string; heroVideo: string }> {
  if (!API_URL) return { heroImage: homeHero, heroVideo: "/Homepage_banner.mp4" };
  try {
    const baseApi = API_URL.startsWith("http")
      ? API_URL
      : `https://www.shriradhagovindstore.com${API_URL}`;
    const response = await fetch(`${baseApi}/settings`);
    if (!response.ok) return { heroImage: homeHero, heroVideo: "/Homepage_banner.mp4" };
    const data = (await response.json()) as {
      settings?: { homeHeroImage?: string; homeHeroVideo?: string };
    };
    const configured = data?.settings?.homeHeroImage?.trim();
    const heroVideo =
      data?.settings?.homeHeroVideo !== undefined
        ? data.settings.homeHeroVideo.trim()
        : "/Homepage_banner.mp4";
    return {
      heroImage: configured ? optimizeHeroImage(configured, 800) : homeHero,
      heroVideo,
    };
  } catch {
    return { heroImage: homeHero, heroVideo: "/Homepage_banner.mp4" };
  }
}

export const Route = createFileRoute("/")({
  loader: async () => {
    return await loadSettingsHero();
  },
  component: Home,
  head: ({ loaderData }) => {
    const heroImage = loaderData?.heroImage || homeHero;
    const baseSeo = pageSeo({
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      path: "/",
    });

    const isHeroImageKit = heroImage.includes("ik.imagekit.io");
    return {
      ...baseSeo,
      links: [
        ...(baseSeo.links || []),
        ...(isHeroImageKit
          ? [
              {
                rel: "preload",
                as: "image",
                href: optimizeHeroImage(heroImage, 480),
                media: "(max-width: 640px)",
                fetchpriority: "high",
              },
              {
                rel: "preload",
                as: "image",
                href: optimizeHeroImage(heroImage, 800),
                media: "(min-width: 641px)",
                fetchpriority: "high",
              },
            ]
          : [
              {
                rel: "preload",
                as: "image",
                href: heroImage,
                fetchpriority: "high",
              },
            ]),
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Shri Radha Govind Store",
            url: "https://www.shriradhagovindstore.com/",
            logo: "https://www.shriradhagovindstore.com/brand-logo-large.png",
            description:
              "Authentic sacred Tulsi malas, Kanthi malas, Puja essentials, Chandan, and devotional items sourced directly from Vrindavan Dham.",
            telephone: "+917500533505",
            email: "support@shriradhagovindstore.com",
            address: {
              "@type": "PostalAddress",
              streetAddress: "155, 2nd Floor, Madan Mohan Ghera",
              addressLocality: "Vrindavan, Mathura",
              addressRegion: "Uttar Pradesh",
              postalCode: "281121",
              addressCountry: "IN",
            },
            sameAs: [
              "https://youtube.com/@shriradhagovindstore?si=mXapbranPLnBCYsj",
              "https://www.instagram.com/shriradhagovind_store?stkn=ZjZhYjVtNjV0bDYz",
              "https://www.facebook.com/profile.php?id=61580313882838",
            ],
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Shri Radha Govind Store",
            url: "https://www.shriradhagovindstore.com/",
            potentialAction: {
              "@type": "SearchAction",
              target: {
                "@type": "EntryPoint",
                urlTemplate: "https://www.shriradhagovindstore.com/shop?q={search_term_string}",
              },
              "query-input": "required name=search_term_string",
            },
          }),
        },
      ],
    };
  },
});

function Home() {
  const loaderData = Route.useLoaderData();
  const { adminProducts, categoryTree, settings, isSettingsLoaded, isProductsLoaded } = useStore();

  const [storyImageLoaded, setStoryImageLoaded] = useState(false);

  // Hero image determination:
  // 1. SSR loader provides the authoritative initial hero immediately so it renders in initial HTML.
  // 2. If client StoreProvider updates settings later with a different URL, honor it.
  const rawHero = (settings?.homeHeroImage?.trim()) || loaderData?.heroImage || homeHero;
  const targetHeroSrc = optimizeHeroImage(rawHero, 800);
  const heroVideo =
    settings?.homeHeroVideo !== undefined
      ? settings.homeHeroVideo.trim()
      : (loaderData?.heroVideo ?? "/Homepage_banner.mp4");

  // Vrindavan story image determination:
  const configuredStory = settings?.vrindavanStoryImage?.trim();
  const isStoryKnown = Boolean(configuredStory) || isSettingsLoaded;
  const rawStory = configuredStory || (isSettingsLoaded ? heroKrishna : null);
  const targetStorySrc = rawStory ? optimizeImageKit(rawStory, 500) : null;

  const categoryShelves = useMemo(
    () =>
      categoryTree
        .map((category) => {
          const names = [category.name, ...category.children.map((child) => child.name)];
          const products = adminProducts
            .filter((product) => names.includes(product.category))
            .sort(
              (a, b) => Number(!!b.featuredDeal) - Number(!!a.featuredDeal) || b.rating - a.rating,
            );
          return { category, products };
        })
        .filter((shelf) => shelf.products.length > 0),
    [adminProducts, categoryTree],
  );

  const splitIndex = Math.min(2, Math.max(1, Math.floor(categoryShelves.length / 2)));
  const topShelves = useMemo(() => categoryShelves.slice(0, splitIndex), [categoryShelves, splitIndex]);
  const bottomShelves = useMemo(() => categoryShelves.slice(splitIndex), [categoryShelves, splitIndex]);

  return (
    <Layout>
      {/* 1. FULL-WIDTH HERO/BANNER (VIDEO 1 BACKGROUND) */}
      <section className="relative overflow-hidden border-b border-[#E7E1D6] bg-[#1a1410] min-h-[500px] sm:min-h-[560px] lg:min-h-[620px] flex items-center">
        {/* Full-width Media Area */}
        <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none">
          {heroVideo ? (
            <video
              src={heroVideo}
              poster={targetHeroSrc}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
          ) : (
            <picture>
              {rawHero?.includes("ik.imagekit.io") && (
                <>
                  <source media="(max-width: 640px)" srcSet={optimizeHeroImage(rawHero, 480)} />
                  <source media="(min-width: 641px)" srcSet={optimizeHeroImage(rawHero, 800)} />
                </>
              )}
              <img
                src={targetHeroSrc}
                alt="Shri Radha Govind Store devotional collection from Vrindavan"
                fetchPriority="high"
                loading="eager"
                decoding="auto"
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
            </picture>
          )}

          {/* Devotional dark overlay & gradient for high text readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/50 to-black/20 sm:from-black/70 sm:via-black/40 sm:to-transparent" />
          <div className="absolute inset-0 bg-black/10" />
        </div>

        {/* Hero Overlaid Content */}
        <div className="container-app relative z-10 py-12 sm:py-16 lg:py-20 max-w-3xl">
          <div className="flex flex-col justify-center text-left">
            <div className="inline-flex items-center gap-2">
              <span className="h-px w-6 bg-[#D9A441]" />
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#E8B858] drop-shadow-xs">
                From the Heart of Vrindavan
              </p>
            </div>

            <h1 className="mt-3 font-serif text-3xl font-semibold leading-[1.15] text-[#FFFDF8] sm:text-5xl lg:text-[3.4rem] drop-shadow-sm">
              Shri Radha Govind Store
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#F0EAE1] sm:text-base drop-shadow-xs">
              Authentic devotional essentials, thoughtfully sourced from Vrindavan.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3 sm:gap-4">
              <Link
                to="/shop"
                className="inline-flex h-11 sm:h-12 items-center justify-center rounded-xl bg-[#D9A441] hover:bg-[#c89433] px-6 sm:px-8 text-xs sm:text-sm font-semibold text-[#2B211C] shadow-md transition active:scale-[0.99]"
              >
                Shop Sacred Collection
              </Link>
              <a
                href="#vrindavan-story"
                className="inline-flex h-11 sm:h-12 items-center justify-center rounded-xl border border-white/30 bg-black/25 backdrop-blur-xs px-5 sm:px-7 text-xs sm:text-sm font-medium text-white transition hover:border-[#D9A441] hover:bg-white/10 active:scale-[0.99]"
              >
                Our Vrindavan Story
              </a>
            </div>

            {/* Compact footnote trust stats */}
            <div className="mt-8 border-t border-white/15 pt-5">
              <div className="flex flex-wrap items-center gap-6 sm:gap-12">
                <div>
                  <div className="text-base sm:text-lg font-bold text-[#FFFDF8]">1K+</div>
                  <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-[#D5CBC0]">
                    Happy Devotees
                  </div>
                </div>
                <div className="h-6 w-px bg-white/20" />
                <div>
                  <div className="text-base sm:text-lg font-bold text-[#FFFDF8]">4.5 / 5</div>
                  <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-[#D5CBC0]">
                    Customer Rating
                  </div>
                </div>
                <div className="h-6 w-px bg-white/20" />
                <div>
                  <div className="text-base sm:text-lg font-bold text-[#FFFDF8]">100%</div>
                  <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-[#D5CBC0]">
                    Authentic Sacred Items
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Seasonal Diwali Greeting */}
      <DiwaliHomepageGreeting />

      {/* 2. PRODUCT SECTIONS & PRESERVED HERO IMAGE MIDDLE SECTION */}
      {!isProductsLoaded && categoryShelves.length === 0 ? (
        <>
          <ProductShelfSkeleton isAlternate={false} categoryName="Tulsi Mala" />
          <ProductShelfSkeleton isAlternate={true} categoryName="Puja Essentials" />
          <MiddleHeroSection rawHero={rawHero} targetHeroSrc={targetHeroSrc} />
        </>
      ) : (
        <>
          {topShelves.map(({ category, products }, index) => (
            <ProductShelfCarousel
              key={category.id}
              category={category}
              products={products}
              isAlternate={index % 2 === 1}
            />
          ))}

          {/* 3. MIDDLE HOMEPAGE SECTION: PRESERVED DEVOTIONAL HERO IMAGE */}
          <MiddleHeroSection rawHero={rawHero} targetHeroSrc={targetHeroSrc} />

          {/* 4. REMAINING PRODUCT SHELVES */}
          {bottomShelves.map(({ category, products }, index) => (
            <ProductShelfCarousel
              key={category.id}
              category={category}
              products={products}
              isAlternate={(index + splitIndex) % 2 === 1}
            />
          ))}
        </>
      )}

      {/* 4. VRINDAVAN STORY SECTION (Short & Compact) */}
      <section
        id="vrindavan-story"
        className="scroll-mt-24 border-b border-[#E7E1D6] bg-[#FAF4EE] py-8 md:py-10"
      >
        <div className="container-app">
          <div className="grid items-center gap-6 md:grid-cols-[280px_1fr] lg:grid-cols-[340px_1fr] lg:gap-10">
            <div className="soft-shadow overflow-hidden rounded-xl border border-[#E7E1D6] bg-white p-1.5">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-[#FAF5EE]">
                {(!isStoryKnown || !storyImageLoaded) && (
                  <div
                    className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#FFFDF8] via-[#FAF4EA] to-[#F2E8DA] select-none"
                    aria-hidden="true"
                  >
                    <div className="h-7 w-7 rounded-full border-2 border-[#D9A441]/30 border-t-[#D9A441] animate-spin" />
                  </div>
                )}
                {targetStorySrc && (
                  <img
                    src={targetStorySrc}
                    alt="Shri Radha Govind Vrindavan"
                    loading="lazy"
                    decoding="async"
                    width={680}
                    height={510}
                    onLoad={() => setStoryImageLoaded(true)}
                    className={`aspect-[4/3] w-full rounded-lg object-cover transition-opacity duration-300 ${
                      storyImageLoaded ? "opacity-100" : "opacity-0"
                    }`}
                  />
                )}
              </div>
            </div>

            <div className="flex flex-col justify-center">
              <div className="inline-flex items-center gap-2">
                <span className="h-px w-5 bg-[#D9A441]" />
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#166F77]">
                  A Little Piece of Vrindavan
                </p>
              </div>

              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#2B211C] sm:text-3xl">
                From our home to yours
              </h2>

              <p className="mt-2 text-xs leading-relaxed text-[#6A605A] sm:text-sm">
                Located in the sacred precincts of Madan Mohan Ghera in Vrindavan, Shri Radha Govind Store brings authentic, consecrated devotional essentials directly from local Braj artisans to your sacred altar. Every mala, poshak, and fragrance is prepared with heartfelt seva and pure devotion.
              </p>

              <div className="mt-4 flex items-center gap-3">
                <Link
                  to="/about"
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-[#166F77] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#135E65]"
                >
                  Read Our Story
                </Link>
                <Link
                  to="/contact"
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-[#E7E1D6] bg-white px-4 text-xs font-medium text-[#2B211C] transition hover:border-[#D9A441]"
                >
                  Visit in Vrindavan
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. GOOGLE REVIEWS SECTION */}
      <GoogleReviewsSection />

      {/* 6. INSTAGRAM SHOWCASE SECTION */}
      <InstagramSection />
    </Layout>
  );
}

function MiddleHeroSection({
  rawHero,
  targetHeroSrc,
}: {
  rawHero: string;
  targetHeroSrc: string;
}) {
  return (
    <section className="border-b border-[#E7E1D6] bg-[#FFFFF4] py-8 md:py-12">
      <div className="container-app">
        <div className="grid items-center gap-6 md:grid-cols-[1.1fr_0.9fr] lg:gap-12">
          <div className="soft-shadow overflow-hidden rounded-2xl border border-[#E7E1D6] bg-white p-2">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#FAF5EE]">
              {/* Visual devotional backdrop beneath hero image */}
              <div
                className="absolute inset-0 z-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#FFFDF8] via-[#FAF4EA] to-[#F2E8DA] p-4 text-center select-none"
                aria-hidden="true"
              >
                <div className="h-8 w-8 rounded-full border-2 border-[#D9A441]/30 border-t-[#D9A441] animate-spin mb-2" />
                <span className="text-[11px] font-serif font-semibold tracking-wider text-[#7A4D20]/60">
                  ॥ श्री राधा गोविन्द ॥
                </span>
              </div>

              <picture>
                {rawHero?.includes("ik.imagekit.io") && (
                  <>
                    <source media="(max-width: 640px)" srcSet={optimizeHeroImage(rawHero, 480)} />
                    <source media="(min-width: 641px)" srcSet={optimizeHeroImage(rawHero, 800)} />
                  </>
                )}
                <img
                  src={targetHeroSrc}
                  alt="Shri Radha Govind Store devotional collection from Vrindavan"
                  loading="lazy"
                  decoding="async"
                  width={800}
                  height={600}
                  className="relative z-10 aspect-[4/3] w-full rounded-xl object-cover object-center"
                />
              </picture>
            </div>
          </div>

          <div className="flex flex-col justify-center text-left">
            <div className="inline-flex items-center gap-2">
              <span className="h-px w-6 bg-[#D9A441]" />
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#166F77]">
                Sacred Heritage of Vrindavan
              </p>
            </div>

            <h2 className="mt-2 font-serif text-2xl font-semibold leading-[1.2] text-[#2B211C] sm:text-3xl lg:text-4xl">
              Consecrated Devotional Essentials
            </h2>

            <p className="mt-3 text-xs leading-relaxed text-[#6A605A] sm:text-base">
              Hand-inspected in Sri Vrindavan Dham before dispatch, every sacred mala, kanthi, and puja item carries the pure spiritual atmosphere of Braj. Invite the divine grace and remembrance of Shri Radha Govind Dev Ji into your daily sadhana.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                to="/shop"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-[#166F77] px-5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#135E65]"
              >
                Explore Sacred Collection
              </Link>
              <Link
                to="/about"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-[#E7E1D6] bg-white px-4 text-xs font-medium text-[#2B211C] transition hover:border-[#D9A441]"
              >
                Our Vrindavan Heritage
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductShelfCarousel({
  category,
  products,
  isAlternate,
}: {
  category: Category;
  products: Product[];
  isAlternate: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Resume autoplay after user interaction ceases
  const scheduleResume = useCallback(() => {
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    pauseTimeoutRef.current = setTimeout(() => {
      setIsPaused(false);
    }, 3500);
  }, []);

  const pauseAutoplay = useCallback(() => {
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    setIsPaused(true);
  }, []);

  const scroll = useCallback(
    (direction: "left" | "right") => {
      if (!scrollRef.current) return;
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      const step = Math.max(145, Math.min(Math.floor(clientWidth * 0.75), 260));

      if (direction === "right") {
        if (scrollLeft + clientWidth >= scrollWidth - 15) {
          scrollRef.current.scrollTo({ left: 0, behavior: "smooth" });
        } else {
          scrollRef.current.scrollBy({ left: step, behavior: "smooth" });
        }
      } else {
        if (scrollLeft <= 10) {
          scrollRef.current.scrollTo({ left: scrollWidth - clientWidth, behavior: "smooth" });
        } else {
          scrollRef.current.scrollBy({ left: -step, behavior: "smooth" });
        }
      }
    },
    [],
  );

  // Autoplay loop with smooth slide interval
  useEffect(() => {
    if (products.length <= 1 || isPaused) return;

    const interval = setInterval(() => {
      scroll("right");
    }, 3800);

    return () => clearInterval(interval);
  }, [products.length, isPaused, scroll]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current);
    };
  }, []);

  const handleArrowClick = (direction: "left" | "right") => {
    pauseAutoplay();
    scroll(direction);
    scheduleResume();
  };

  const bgClass = isAlternate ? "bg-[#FAF4EE]" : "bg-[#FFFFF4]";

  return (
    <section
      className={`border-b border-[#E7E1D6] ${bgClass} py-6 md:py-8`}
      onMouseEnter={pauseAutoplay}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={pauseAutoplay}
      onTouchEnd={scheduleResume}
    >
      <div className="container-app">
        {/* Section Header */}
        <div className="flex items-end justify-between gap-3 border-b border-[#E7E1D6] pb-2.5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#D9A441]">
              TOP PICKS
            </p>
            <h2 className="mt-0.5 font-serif text-xl font-semibold text-[#2B211C] sm:text-2xl">
              Best of {category.name}
            </h2>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {products.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleArrowClick("left")}
                  className="grid h-7 w-7 place-items-center rounded-full border border-[#E7E1D6] bg-white text-[#2B211C] shadow-sm transition hover:border-[#166F77] hover:text-[#166F77] hover:bg-[#F8F4EC] active:scale-95"
                  aria-label={`Scroll ${category.name} left`}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleArrowClick("right")}
                  className="grid h-7 w-7 place-items-center rounded-full border border-[#E7E1D6] bg-white text-[#2B211C] shadow-sm transition hover:border-[#166F77] hover:text-[#166F77] hover:bg-[#F8F4EC] active:scale-95"
                  aria-label={`Scroll ${category.name} right`}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <Link
              to="/shop"
              search={{ cat: category.name } as never}
              className="group inline-flex items-center gap-1 text-xs font-semibold text-[#166F77] hover:text-[#135E65]"
            >
              <span>See all {category.name}</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>

        {/* Single Horizontal Row Carousel / Slider (desktop ~4-5, tablet ~3, mobile ~1.5-2) */}
        <div
          ref={scrollRef}
          onScroll={pauseAutoplay}
          className="mt-4 flex min-h-[270px] sm:min-h-[350px] snap-x snap-mandatory gap-2.5 sm:gap-3.5 overflow-x-auto scroll-smooth py-1 px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {products.map((product) => (
            <div
              key={product.id}
              className="w-[145px] min-[360px]:w-[155px] min-[390px]:w-[165px] sm:w-[185px] md:w-[205px] lg:w-[225px] shrink-0 snap-start"
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductShelfSkeleton({ isAlternate, categoryName }: { isAlternate: boolean; categoryName: string }) {
  const bgClass = isAlternate ? "bg-[#FAF4EE]" : "bg-[#FFFFF4]";

  return (
    <section className={`border-b border-[#E7E1D6] ${bgClass} py-6 md:py-8`}>
      <div className="container-app">
        {/* Section Header Skeleton */}
        <div className="flex items-end justify-between gap-3 border-b border-[#E7E1D6] pb-2.5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#D9A441]">
              TOP PICKS
            </p>
            <h2 className="mt-0.5 font-serif text-xl font-semibold text-[#2B211C] sm:text-2xl">
              Best of {categoryName}
            </h2>
          </div>
          <div className="h-4 w-28 rounded bg-[#E7E1D6]/60 animate-pulse" />
        </div>

        {/* Carousel Row Skeleton matching card widths */}
        <div className="mt-4 flex min-h-[270px] sm:min-h-[350px] gap-2.5 sm:gap-3.5 overflow-hidden py-1 px-0.5">
          {[1, 2, 3, 4, 5].map((idx) => (
            <div
              key={idx}
              className="w-[145px] min-[360px]:w-[155px] min-[390px]:w-[165px] sm:w-[185px] md:w-[205px] lg:w-[225px] shrink-0"
            >
              <div className="rounded-xl border border-[#E7E1D6] bg-white p-2 sm:p-2.5 shadow-sm">
                <div className="aspect-square w-full rounded-lg bg-[#FAF4EA] animate-pulse" />
                <div className="mt-2.5 h-3.5 w-4/5 rounded bg-[#FAF4EA] animate-pulse" />
                <div className="mt-1.5 h-3 w-3/5 rounded bg-[#FAF4EA] animate-pulse" />
                <div className="mt-3 flex items-center justify-between">
                  <div className="h-4 w-12 rounded bg-[#FAF4EA] animate-pulse" />
                  <div className="h-7 w-16 rounded bg-[#FAF4EA] animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

