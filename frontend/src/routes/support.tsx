import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { useStore } from "@/lib/store";
import { api, isApiEnabled } from "@/lib/api";
import { toast } from "sonner";
import {
  LifeBuoy,
  Search,
  MessageSquare,
  HelpCircle,
  FileQuestion,
  Send,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MessageCircle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Package,
  RotateCcw,
  CreditCard,
  ArrowRight,
  User,
  ShieldCheck,
  Lock,
} from "lucide-react";
import { buildDefaultWhatsAppUrl } from "@/lib/whatsapp";
import type {
  SupportTicket,
  SupportCategory,
  SupportStatus,
  FAQCategoryGroup,
} from "@/lib/types/support";
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUS_LABELS,
  SUPPORT_STATUS_COLORS,
} from "@/lib/types/support";

interface SupportSearch {
  tab?: "faq" | "submit" | "track" | "my";
  ticketNo?: string;
  orderId?: string;
  orderNo?: string;
  category?: SupportCategory;
}

export const Route = createFileRoute("/support")({
  validateSearch: (search: Record<string, unknown>): SupportSearch => ({
    tab: ["faq", "submit", "track", "my"].includes(search.tab as string)
      ? (search.tab as SupportSearch["tab"])
      : "faq",
    ticketNo: typeof search.ticketNo === "string" ? search.ticketNo : undefined,
    orderId: typeof search.orderId === "string" ? search.orderId : undefined,
    orderNo: typeof search.orderNo === "string" ? search.orderNo : undefined,
    category: typeof search.category === "string" ? (search.category as SupportCategory) : undefined,
  }),
  component: SupportHelpCenterPage,
  head: () => ({
    meta: [
      { title: "Help Center & Devotee Support — Shri Radha Govind Store" },
      {
        name: "description",
        content:
          "Need help with your devotional order, courier delivery, cancellation, returns or puja guidance? Reach our Vrindavan seva team.",
      },
    ],
  }),
});

function SupportHelpCenterPage() {
  const search = useSearch({ from: "/support" });
  const { user } = useStore();

  const [activeTab, setActiveTab] = useState<"faq" | "submit" | "track" | "my">(
    search.tab || "faq"
  );

  // FAQ state
  const [faqs, setFaqs] = useState<FAQCategoryGroup[]>([]);
  const [loadingFaqs, setLoadingFaqs] = useState(true);
  const [faqSearch, setFaqSearch] = useState("");
  const [selectedFaqCategory, setSelectedFaqCategory] = useState<string>("ALL");
  const [openFaqIndex, setOpenFaqIndex] = useState<string | null>(null);

  // Submit Ticket Form state
  const [ticketCategory, setTicketCategory] = useState<SupportCategory>(
    search.category || "Order Status & Delivery"
  );
  const [customerName, setCustomerName] = useState(user?.name || "");
  const [customerEmail, setCustomerEmail] = useState(user?.email || "");
  const [customerPhone, setCustomerPhone] = useState(user?.phone || "");
  const [orderNoInput, setOrderNoInput] = useState(search.orderNo || "");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<SupportTicket | null>(null);

  // Track Ticket state
  const [trackTicketNo, setTrackTicketNo] = useState(search.ticketNo || "");
  const [trackEmail, setTrackEmail] = useState(user?.email || "");
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [trackedTicket, setTrackedTicket] = useState<SupportTicket | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // My Tickets state
  const [myTickets, setMyTickets] = useState<SupportTicket[]>([]);
  const [loadingMyTickets, setLoadingMyTickets] = useState(false);

  // Fetch FAQ from API
  const fetchFaqs = useCallback(async () => {
    try {
      setLoadingFaqs(true);
      const res = await api<{
        categories?: FAQCategoryGroup[];
        faqGroups?: FAQCategoryGroup[];
        ok?: boolean;
      }>("/support/faq");
      const list = res?.categories ?? res?.faqGroups;
      if (Array.isArray(list)) {
        setFaqs(list);
      } else {
        setFaqs([]);
      }
    } catch {
      // Fallback local FAQ if network fails
    } finally {
      setLoadingFaqs(false);
    }
  }, []);

  // Fetch My Tickets
  const fetchMyTickets = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingMyTickets(true);
      const res = await api<{ ok: boolean; tickets: SupportTicket[] }>("/support/tickets/my");
      if (res?.ok && Array.isArray(res.tickets)) {
        setMyTickets(res.tickets);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to load support tickets");
    } finally {
      setLoadingMyTickets(false);
    }
  }, [user]);

  useEffect(() => {
    fetchFaqs();
  }, [fetchFaqs]);

  useEffect(() => {
    if (activeTab === "my" && user) {
      fetchMyTickets();
    }
  }, [activeTab, user, fetchMyTickets]);

  // Sync user details to form when user logs in
  useEffect(() => {
    if (user) {
      if (!customerName) setCustomerName(user.name);
      if (!customerEmail) setCustomerEmail(user.email);
      if (!customerPhone && user.phone) setCustomerPhone(user.phone);
      if (!trackEmail) setTrackEmail(user.email);
    }
  }, [user]);

  // Handle URL ticketNo tracking
  useEffect(() => {
    if (search.ticketNo) {
      setTrackTicketNo(search.ticketNo);
      setActiveTab("track");
      if (user?.email) {
        handleTrackTicket(search.ticketNo, user.email);
      }
    }
  }, [search.ticketNo]);

  // Track single ticket
  const handleTrackTicket = async (ticketNoOrId?: string, emailArg?: string) => {
    const targetNo = (ticketNoOrId || trackTicketNo).trim();
    const emailToUse = (emailArg || trackEmail).trim().toLowerCase();

    if (!targetNo) {
      toast.error("Please enter your Ticket Number (e.g., SRGS-10001)");
      return;
    }

    try {
      setLoadingTrack(true);
      const queryParam = emailToUse ? `?email=${encodeURIComponent(emailToUse)}` : "";
      const res = await api<{ ok: boolean; ticket: SupportTicket }>(
        `/support/tickets/${encodeURIComponent(targetNo)}${queryParam}`
      );
      if (res?.ok && res.ticket) {
        setTrackedTicket(res.ticket);
      } else {
        toast.error("Ticket not found");
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not retrieve ticket. Please check ticket number and email.");
      setTrackedTicket(null);
    } finally {
      setLoadingTrack(false);
    }
  };

  // Submit new ticket
  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerEmail.trim()) {
      toast.error("Please provide your name and email address");
      return;
    }
    if (!ticketSubject.trim() || ticketSubject.trim().length < 5) {
      toast.error("Please provide a descriptive subject (at least 5 characters)");
      return;
    }
    if (!ticketMessage.trim() || ticketMessage.trim().length < 10) {
      toast.error("Please describe your issue in detail (at least 10 characters)");
      return;
    }

    try {
      setSubmittingTicket(true);
      const res = await api<{ ok: boolean; ticket: SupportTicket; message: string }>(
        "/support/tickets",
        {
          method: "POST",
          body: {
            customerName: customerName.trim(),
            customerEmail: customerEmail.trim().toLowerCase(),
            customerPhone: customerPhone.trim() || undefined,
            orderIdOrNo: orderNoInput.trim() || undefined,
            category: ticketCategory,
            subject: ticketSubject.trim(),
            message: ticketMessage.trim(),
          },
        }
      );

      if (res?.ok && res.ticket) {
        setCreatedTicket(res.ticket);
        toast.success(res.message || `Support ticket #${res.ticket.ticketNo} created!`);
        // Reset inputs
        setTicketSubject("");
        setTicketMessage("");
        setOrderNoInput("");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit support ticket. Please try again.");
    } finally {
      setSubmittingTicket(false);
    }
  };

  // Customer Reply to Ticket
  const handleCustomerReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackedTicket) return;
    if (!replyMessage.trim() || replyMessage.trim().length < 2) {
      toast.error("Please enter a reply message");
      return;
    }

    try {
      setSendingReply(true);
      const res = await api<{ ok: boolean; ticket: SupportTicket; message: string }>(
        `/support/tickets/${trackedTicket.ticketNo}/reply`,
        {
          method: "POST",
          body: {
            message: replyMessage.trim(),
            email: trackEmail.trim().toLowerCase() || undefined,
          },
        }
      );

      if (res?.ok && res.ticket) {
        setTrackedTicket(res.ticket);
        setReplyMessage("");
        toast.success(res.message || "Reply sent successfully to the seva team!");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to send reply. Please try again.");
    } finally {
      setSendingReply(false);
    }
  };

  // Filtered FAQs
  const filteredFaqs = (Array.isArray(faqs) ? faqs : []).flatMap((group) => {
    if (!group || !Array.isArray(group.faqs)) {
      return [];
    }
    if (selectedFaqCategory !== "ALL" && group.category !== selectedFaqCategory) {
      return [];
    }
    return group.faqs
      .filter((faq) => {
        if (!faq || typeof faq.q !== "string") return false;
        if (!faqSearch.trim()) return true;
        const term = faqSearch.toLowerCase();
        return (
          faq.q.toLowerCase().includes(term) ||
          (typeof faq.a === "string" && faq.a.toLowerCase().includes(term))
        );
      })
      .map((faq) => ({ ...faq, groupCategory: group.category }));
  });

  return (
    <Layout>
      <div className="bg-[#FAF8F5] min-h-screen pb-16">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-[#166F77]/10 via-[#FAF8F5] to-[#FAF8F5] pt-12 pb-8 border-b border-[#E7E1D6]">
          <div className="container-app text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#166F77]/10 text-[#166F77] text-xs font-semibold uppercase tracking-wider mb-4">
              Vrindavan Seva & Devotee Care
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-[#2B211C] tracking-tight">
              Hare Krishna! How may we assist you?
            </h1>
            <p className="mt-3 text-sm sm:text-base text-[#6A605A] leading-relaxed max-w-2xl mx-auto">
              Welcome to the Shri Radha Govind Store Help Center. Find instant answers in our FAQs,
              track your order delivery, or open a support ticket with our seva team.
            </p>

            {/* Quick Navigation Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 text-left">
              <button
                type="button"
                onClick={() => setActiveTab("faq")}
                className={`p-4 rounded-xl border transition text-left cursor-pointer ${
                  activeTab === "faq"
                    ? "bg-white border-[#166F77] shadow-md ring-2 ring-[#166F77]/20"
                    : "bg-white/80 hover:bg-white border-[#E7E1D6] hover:border-[#166F77]/50 shadow-xs"
                }`}
              >
                <HelpCircle
                  className={`w-6 h-6 mb-2 ${
                    activeTab === "faq" ? "text-[#166F77]" : "text-stone-500"
                  }`}
                />
                <div className="font-semibold text-xs sm:text-sm text-[#2B211C]">Knowledge Base</div>
                <div className="text-[11px] text-[#6A605A] mt-0.5">Instant FAQs & answers</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCreatedTicket(null);
                  setActiveTab("submit");
                }}
                className={`p-4 rounded-xl border transition text-left cursor-pointer ${
                  activeTab === "submit"
                    ? "bg-white border-[#166F77] shadow-md ring-2 ring-[#166F77]/20"
                    : "bg-white/80 hover:bg-white border-[#E7E1D6] hover:border-[#166F77]/50 shadow-xs"
                }`}
              >
                <LifeBuoy
                  className={`w-6 h-6 mb-2 ${
                    activeTab === "submit" ? "text-[#166F77]" : "text-stone-500"
                  }`}
                />
                <div className="font-semibold text-xs sm:text-sm text-[#2B211C]">Open a Ticket</div>
                <div className="text-[11px] text-[#6A605A] mt-0.5">Reach our seva team</div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("track")}
                className={`p-4 rounded-xl border transition text-left cursor-pointer ${
                  activeTab === "track"
                    ? "bg-white border-[#166F77] shadow-md ring-2 ring-[#166F77]/20"
                    : "bg-white/80 hover:bg-white border-[#E7E1D6] hover:border-[#166F77]/50 shadow-xs"
                }`}
              >
                <Clock
                  className={`w-6 h-6 mb-2 ${
                    activeTab === "track" ? "text-[#166F77]" : "text-stone-500"
                  }`}
                />
                <div className="font-semibold text-xs sm:text-sm text-[#2B211C]">Track Ticket</div>
                <div className="text-[11px] text-[#6A605A] mt-0.5">View replies & updates</div>
              </button>

              <a
                href={buildDefaultWhatsAppUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-50 hover:border-emerald-300 transition text-left shadow-xs flex flex-col justify-between"
              >
                <div>
                  <MessageCircle className="w-6 h-6 mb-2 text-emerald-600" />
                  <div className="font-semibold text-xs sm:text-sm text-emerald-900">
                    WhatsApp Seva
                  </div>
                  <div className="text-[11px] text-emerald-700 mt-0.5">Direct chat & photos</div>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 mt-2">
                  <span>Chat now</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </a>
            </div>

            {/* Authenticated user quick pill */}
            {user && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setActiveTab("my")}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition ${
                    activeTab === "my"
                      ? "bg-[#166F77] text-white shadow-sm"
                      : "bg-white border border-[#E7E1D6] text-stone-700 hover:border-[#166F77]"
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>My Support Tickets</span>
                  {myTickets.length > 0 && (
                    <span className="px-1.5 py-0.2 bg-amber-400 text-stone-900 rounded-full text-[10px] font-bold">
                      {myTickets.length}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Tab 1: FAQs & Knowledge Base */}
        {activeTab === "faq" && (
          <section className="container-app max-w-4xl mx-auto mt-8">
            {/* Search and Category Filters */}
            <div className="bg-white rounded-2xl border border-[#E7E1D6] p-5 shadow-xs mb-6">
              <div className="relative">
                <Search className="absolute left-3.5 top-3 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  placeholder="Search questions (e.g. shipping time, cancel order, return window)..."
                  value={faqSearch}
                  onChange={(e) => setFaqSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50/50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#166F77]/20 focus:border-[#166F77]"
                />
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pt-3 pb-1 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedFaqCategory("ALL")}
                  className={`px-3 py-1.5 rounded-full font-medium transition shrink-0 cursor-pointer ${
                    selectedFaqCategory === "ALL"
                      ? "bg-[#166F77] text-white"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  All Questions
                </button>
                {faqs.map((g) => (
                  <button
                    key={g.category}
                    type="button"
                    onClick={() => setSelectedFaqCategory(g.category)}
                    className={`px-3 py-1.5 rounded-full font-medium transition shrink-0 cursor-pointer ${
                      selectedFaqCategory === g.category
                        ? "bg-[#166F77] text-white"
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    }`}
                  >
                    {g.category}
                  </button>
                ))}
              </div>
            </div>

            {/* FAQ Accordion List */}
            {loadingFaqs ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-[#E7E1D6]">
                <RefreshCw className="w-6 h-6 animate-spin text-[#166F77] mx-auto mb-2" />
                <p className="text-sm text-stone-500">Loading help articles...</p>
              </div>
            ) : filteredFaqs.length === 0 ? (
              <div className="text-center py-14 bg-white rounded-2xl border border-[#E7E1D6] p-6">
                <FileQuestion className="w-12 h-12 text-stone-300 mx-auto mb-3" />
                <h3 className="font-serif text-lg font-bold text-stone-800">
                  No matching answers found
                </h3>
                <p className="text-sm text-stone-500 mt-1 max-w-md mx-auto">
                  Didn't find what you were looking for? Open a support ticket and our Vrindavan seva
                  team will assist you personally.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setTicketSubject(faqSearch);
                    setActiveTab("submit");
                  }}
                  className="mt-4 px-5 py-2.5 rounded-full bg-[#166F77] text-white text-xs font-semibold hover:bg-[#12585e] transition"
                >
                  Open a Support Ticket with this query
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredFaqs.map((faq, index) => {
                  const key = `${faq.groupCategory}-${index}`;
                  const isOpen = openFaqIndex === key;
                  return (
                    <div
                      key={key}
                      className="bg-white rounded-xl border border-[#E7E1D6] overflow-hidden transition shadow-xs hover:border-[#166F77]/40"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenFaqIndex(isOpen ? null : key)}
                        className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-stone-100 text-stone-600 shrink-0">
                            {faq.groupCategory}
                          </span>
                          <span className="font-medium text-sm sm:text-base text-stone-900">
                            {faq.q}
                          </span>
                        </div>
                        {isOpen ? (
                          <ChevronDown className="w-4 h-4 text-[#166F77] shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
                        )}
                      </button>

                      {isOpen && (
                        <div className="px-5 pb-5 pt-1 text-sm text-[#4A403A] border-t border-stone-100 bg-[#FAF8F5]/50 leading-relaxed">
                          <p>{faq.a}</p>
                          {faq.link && (
                            <div className="mt-3">
                              <Link
                                to={faq.link}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#166F77] hover:underline"
                              >
                                <span>{faq.linkText || "View policy details"}</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Tab 2: Submit Support Ticket */}
        {activeTab === "submit" && (
          <section className="container-app max-w-2xl mx-auto mt-8">
            {createdTicket ? (
              <div className="bg-white rounded-2xl border border-emerald-200 p-8 text-center shadow-sm">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  Ticket #{createdTicket.ticketNo}
                </span>
                <h2 className="font-serif text-2xl font-bold text-stone-900 mt-3">
                  Support Request Received!
                </h2>
                <p className="text-sm text-stone-600 mt-2 max-w-lg mx-auto leading-relaxed">
                  Hare Krishna 🙏 We have received your query. A confirmation has been dispatched to{" "}
                  <b>{createdTicket.customerEmail}</b>. Our seva team in Vrindavan typically replies
                  within 24 working hours.
                </p>

                <div className="bg-[#FAF8F5] border border-[#E7E1D6] rounded-xl p-4 mt-6 text-left text-xs text-stone-700 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Category:</span>
                    <span className="font-medium">
                      {SUPPORT_CATEGORY_LABELS[createdTicket.category]}
                    </span>
                  </div>
                  {createdTicket.orderNo && (
                    <div className="flex justify-between">
                      <span className="text-stone-500">Linked Order:</span>
                      <span className="font-medium">#{createdTicket.orderNo}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-stone-500">Status:</span>
                    <span className="font-semibold text-amber-700">Open & Under Review</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setTrackTicketNo(createdTicket.ticketNo);
                      setTrackEmail(createdTicket.customerEmail);
                      handleTrackTicket(createdTicket.ticketNo, createdTicket.customerEmail);
                      setActiveTab("track");
                    }}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-full bg-[#166F77] text-white text-xs font-semibold hover:bg-[#12585e] transition"
                  >
                    View Ticket & Message Thread
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreatedTicket(null)}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-full border border-stone-300 text-stone-700 text-xs font-semibold hover:bg-stone-50 transition"
                  >
                    Open Another Ticket
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-[#E7E1D6] p-6 sm:p-8 shadow-xs">
                <div className="border-b border-stone-100 pb-4 mb-6">
                  <h2 className="font-serif text-2xl font-bold text-stone-900">
                    Open a Support Ticket
                  </h2>
                  <p className="text-xs sm:text-sm text-stone-500 mt-1">
                    Please provide the details below so our seva team can investigate and assist you
                    speedily.
                  </p>
                </div>

                <form onSubmit={handleSubmitTicket} className="space-y-4">
                  {/* Category Selection */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">
                      Issue Category <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={ticketCategory}
                      onChange={(e) => setTicketCategory(e.target.value as SupportCategory)}
                      className="w-full h-11 px-3 rounded-xl border border-stone-200 bg-stone-50/50 text-sm focus:bg-white focus:outline-none focus:border-[#166F77]"
                    >
                      <option value="Order Status & Delivery">
                        Order Status & Delivery (Tracking, shipping updates)
                      </option>
                      <option value="Cancellation & Modification">
                        Cancellation & Modification (Cancel before dispatch)
                      </option>
                      <option value="Returns & Replacements">
                        Returns & Replacements (Return window guidance)
                      </option>
                      <option value="Payment & Billing">
                        Payment & Billing (GST invoice, payment confirmations)
                      </option>
                      <option value="Product Inquiry & Poshak Sizing">
                        Product Inquiry & Poshak Sizing (Tulsi beads, sizes)
                      </option>
                      <option value="Loyalty & Coupons">
                        Loyalty & Coupons (Points balance, promo codes)
                      </option>
                      <option value="General & Seva Query">
                        General & Seva Query (General feedback, Vrindavan seva)
                      </option>
                    </select>
                  </div>

                  {/* Customer Name & Email */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">
                        Your Full Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Radhika Sharma"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-xl border border-stone-200 bg-stone-50/50 text-sm focus:bg-white focus:outline-none focus:border-[#166F77]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">
                        Email Address <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="e.g. radhika@example.com"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-xl border border-stone-200 bg-stone-50/50 text-sm focus:bg-white focus:outline-none focus:border-[#166F77]"
                      />
                    </div>
                  </div>

                  {/* Phone & Order No */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">
                        Phone / WhatsApp (Optional)
                      </label>
                      <input
                        type="tel"
                        placeholder="e.g. +91 9876543210"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-xl border border-stone-200 bg-stone-50/50 text-sm focus:bg-white focus:outline-none focus:border-[#166F77]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">
                        Order Number (If applicable)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 1042 or full Order ID"
                        value={orderNoInput}
                        onChange={(e) => setOrderNoInput(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-xl border border-stone-200 bg-stone-50/50 text-sm focus:bg-white focus:outline-none focus:border-[#166F77]"
                      />
                    </div>
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">
                      Subject / Brief Summary <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Tracking update for Vrindavan Tulsi Mala order"
                      value={ticketSubject}
                      onChange={(e) => setTicketSubject(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-stone-200 bg-stone-50/50 text-sm focus:bg-white focus:outline-none focus:border-[#166F77]"
                    />
                  </div>

                  {/* Message */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">
                      Detailed Description <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      required
                      rows={5}
                      placeholder="Please provide any helpful context or questions so our seva team can assist you effectively..."
                      value={ticketMessage}
                      onChange={(e) => setTicketMessage(e.target.value)}
                      className="w-full p-3.5 rounded-xl border border-stone-200 bg-stone-50/50 text-sm focus:bg-white focus:outline-none focus:border-[#166F77] leading-relaxed"
                    />
                  </div>

                  {/* Photo / WhatsApp Notice Banner */}
                  <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-900">
                    <div>
                      <span className="font-semibold">Have photos or courier unboxing evidence?</span>{" "}
                      You can send attachments directly to our official WhatsApp helpline at{" "}
                      <a
                        href={buildDefaultWhatsAppUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-semibold hover:text-amber-800"
                      >
                        +91 7500533505
                      </a>{" "}
                      quoting your Ticket # or Order #.
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={submittingTicket}
                    className="w-full h-12 rounded-xl bg-[#166F77] text-white font-semibold text-sm hover:bg-[#12585e] transition flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer shadow-xs active:scale-[0.99]"
                  >
                    {submittingTicket ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Submitting Ticket...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Submit Support Ticket</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}
          </section>
        )}

        {/* Tab 3: Track Existing Ticket */}
        {activeTab === "track" && (
          <section className="container-app max-w-3xl mx-auto mt-8">
            {/* Search Ticket Card */}
            <div className="bg-white rounded-2xl border border-[#E7E1D6] p-6 shadow-xs mb-6">
              <h2 className="font-serif text-xl font-bold text-stone-900 mb-1">
                Track Support Ticket
              </h2>
              <p className="text-xs text-stone-500 mb-4">
                Enter your Ticket Number and the email address used to open the ticket.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleTrackTicket();
                }}
                className="grid grid-cols-1 sm:grid-cols-12 gap-3"
              >
                <div className="sm:col-span-6">
                  <input
                    type="text"
                    required
                    placeholder="Ticket # (e.g. SRGS-10001)"
                    value={trackTicketNo}
                    onChange={(e) => setTrackTicketNo(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-[#166F77]"
                  />
                </div>
                <div className="sm:col-span-4">
                  <input
                    type="email"
                    required
                    placeholder="Your Email Address"
                    value={trackEmail}
                    onChange={(e) => setTrackEmail(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-[#166F77]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={loadingTrack}
                    className="w-full h-11 rounded-xl bg-[#166F77] text-white text-xs font-semibold hover:bg-[#12585e] transition flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer"
                  >
                    {loadingTrack ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Search className="w-3.5 h-3.5" />
                        <span>Search</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Ticket Conversation View */}
            {trackedTicket && (
              <div className="bg-white rounded-2xl border border-[#E7E1D6] overflow-hidden shadow-xs">
                {/* Ticket Header */}
                <div className="p-6 border-b border-stone-100 bg-[#FAF8F5]/80">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-stone-900 bg-stone-200/70 px-2.5 py-0.5 rounded-md">
                        {trackedTicket.ticketNo}
                      </span>
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                          SUPPORT_STATUS_COLORS[trackedTicket.status]?.bg || "bg-stone-100"
                        } ${SUPPORT_STATUS_COLORS[trackedTicket.status]?.text || "text-stone-700"} ${
                          SUPPORT_STATUS_COLORS[trackedTicket.status]?.border || "border-stone-200"
                        }`}
                      >
                        {SUPPORT_STATUS_LABELS[trackedTicket.status] || trackedTicket.status}
                      </span>
                    </div>

                    <div className="text-xs text-stone-500">
                      Opened on{" "}
                      {new Date(trackedTicket.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </div>

                  <h3 className="font-serif text-xl font-bold text-stone-900">
                    {trackedTicket.subject}
                  </h3>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-stone-600">
                    <span>
                      <b>Category:</b> {SUPPORT_CATEGORY_LABELS[trackedTicket.category]}
                    </span>
                    {trackedTicket.orderNo && (
                      <span className="flex items-center gap-1 text-[#166F77] font-medium">
                        <Package className="w-3.5 h-3.5" />
                        <Link
                          to="/orders/$id"
                          params={{ id: String(trackedTicket.orderNo) }}
                          className="hover:underline"
                        >
                          Order #{trackedTicket.orderNo}
                        </Link>
                      </span>
                    )}
                    {trackedTicket.autoCloseAt && trackedTicket.status === "RESOLVED" && (
                      <span className="text-amber-700">
                        Will auto-close on{" "}
                        {new Date(trackedTicket.autoCloseAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Conversation Messages Timeline */}
                <div className="p-6 space-y-4 max-h-[500px] overflow-y-auto">
                  {trackedTicket.messages.map((m, idx) => {
                    const isAdmin = m.senderType === "admin";
                    const isSystem = m.senderType === "system";

                    if (isSystem) {
                      return (
                        <div
                          key={idx}
                          className="text-center py-2 px-4 rounded-xl bg-stone-50 text-[11px] text-stone-500 italic border border-stone-200/50 max-w-md mx-auto"
                        >
                          {m.message}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={idx}
                        className={`flex flex-col ${isAdmin ? "items-start" : "items-end"}`}
                      >
                        <div className="flex items-center gap-1.5 text-[11px] text-stone-400 mb-1 px-1">
                          <span className="font-semibold text-stone-700">{m.senderName}</span>
                          <span>•</span>
                          <span>
                            {new Date(m.createdAt).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </div>

                        <div
                          className={`p-4 rounded-2xl max-w-xl text-sm leading-relaxed whitespace-pre-wrap ${
                            isAdmin
                              ? "bg-[#166F77]/10 text-stone-900 border border-[#166F77]/20 rounded-tl-xs"
                              : "bg-[#166F77] text-white rounded-tr-xs"
                          }`}
                        >
                          {m.message}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Reply Section */}
                <div className="p-5 border-t border-stone-100 bg-[#FAF8F5]/60">
                  {trackedTicket.status === "CLOSED" ? (
                    <div className="p-3.5 rounded-xl bg-stone-100 border border-stone-200 text-xs text-stone-600 text-center">
                      <Lock className="w-4 h-4 mx-auto mb-1 text-stone-400" />
                      This support ticket has been closed. If you have an inquiry on a new matter,
                      please{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setCreatedTicket(null);
                          setActiveTab("submit");
                        }}
                        className="text-[#166F77] font-semibold underline"
                      >
                        open a new ticket
                      </button>
                      .
                    </div>
                  ) : (
                    <form onSubmit={handleCustomerReply} className="space-y-3">
                      {trackedTicket.status === "RESOLVED" && (
                        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                          <b>Note:</b> This ticket is currently marked as Resolved. Sending a reply
                          will automatically reopen it for our seva team.
                        </div>
                      )}
                      <textarea
                        required
                        rows={3}
                        placeholder="Write your reply or question for the seva team..."
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        className="w-full p-3 rounded-xl border border-stone-200 bg-white text-sm focus:outline-none focus:border-[#166F77]"
                      />
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={sendingReply}
                          className="px-5 py-2 rounded-xl bg-[#166F77] text-white text-xs font-semibold hover:bg-[#12585e] transition flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
                        >
                          {sendingReply ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              <span>Send Reply</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Tab 4: My Tickets (for logged-in devotees) */}
        {activeTab === "my" && (
          <section className="container-app max-w-4xl mx-auto mt-8">
            <div className="bg-white rounded-2xl border border-[#E7E1D6] p-6 shadow-xs">
              <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-6">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-stone-900">
                    My Support Tickets
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    History of your support requests with Shri Radha Govind Store
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCreatedTicket(null);
                    setActiveTab("submit");
                  }}
                  className="px-4 py-2 rounded-full bg-[#166F77] text-white text-xs font-semibold hover:bg-[#12585e] transition"
                >
                  + New Ticket
                </button>
              </div>

              {loadingMyTickets ? (
                <div className="text-center py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-[#166F77] mx-auto mb-2" />
                  <p className="text-sm text-stone-500">Loading your tickets...</p>
                </div>
              ) : myTickets.length === 0 ? (
                <div className="text-center py-12">
                  <LifeBuoy className="w-10 h-10 text-stone-300 mx-auto mb-2" />
                  <p className="text-sm text-stone-500">You don't have any support tickets yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myTickets.map((t) => (
                    <div
                      key={t._id}
                      onClick={() => {
                        setTrackTicketNo(t.ticketNo);
                        setTrackEmail(t.customerEmail);
                        handleTrackTicket(t.ticketNo, t.customerEmail);
                        setActiveTab("track");
                      }}
                      className="p-4 rounded-xl border border-stone-200 hover:border-[#166F77] hover:bg-[#FAF8F5] transition cursor-pointer flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-bold text-stone-800">
                            {t.ticketNo}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                              SUPPORT_STATUS_COLORS[t.status]?.bg || "bg-stone-100"
                            } ${SUPPORT_STATUS_COLORS[t.status]?.text || "text-stone-700"} ${
                              SUPPORT_STATUS_COLORS[t.status]?.border || "border-stone-200"
                            }`}
                          >
                            {SUPPORT_STATUS_LABELS[t.status] || t.status}
                          </span>
                          <span className="text-[11px] text-stone-400">
                            {SUPPORT_CATEGORY_LABELS[t.category]}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-stone-900 truncate">
                          {t.subject}
                        </h4>
                        <p className="text-xs text-stone-500 mt-1">
                          Updated:{" "}
                          {new Date(t.updatedAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {t.orderNo && (
                          <span className="text-xs text-[#166F77] bg-[#166F77]/10 px-2 py-1 rounded-md font-medium">
                            Order #{t.orderNo}
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-stone-400" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
