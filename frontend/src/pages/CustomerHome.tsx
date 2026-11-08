import { useEffect, useState, type FormEvent } from "react";
import { Bot, ClipboardList, Plus, Send, UserRound, X } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  apiDataProvider,
  type ChatTurn,
} from "../services/ApiDataProvider";
import {
  currentOrderRole,
  isDemoSession,
  productionOrderService,
  type OrderDetails,
  type OrderInputLine,
  type Product,
  type ProductionOrder,
} from "../services/ProductionOrders";

interface EditableLine extends OrderInputLine {
  key: number;
}

function localDateTimeValue(value: Date): string {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function statusLabel(status: ProductionOrder["status"]): string {
  const labels: Record<ProductionOrder["status"], string> = {
    DRAFT: "Draft — belum dikirim",
    SUBMITTED: "Diajukan — menunggu Manager",
    REVISION_REQUESTED: "Perlu revisi",
    REJECTED: "Ditolak",
    APPROVED: "Disetujui — menunggu jadwal",
    SCHEDULED: "Terjadwal — menunggu Operator",
    IN_PROGRESS: "Sedang diproduksi",
    COMPLETED: "Selesai",
  };
  return labels[status];
}

function demoCustomerAnswer(
  message: string,
  products: Product[],
  orders: ProductionOrder[],
): string {
  const query = message.toLowerCase();
  if (/order|pesanan|permintaan|status/.test(query)) {
    const latestOrder = orders[0];
    return latestOrder
      ? `Order ${latestOrder.id} berstatus ${statusLabel(latestOrder.status)}. Target: ${new Date(latestOrder.target_at).toLocaleString()}.${latestOrder.manager_note ? ` Catatan Manager: ${latestOrder.manager_note}` : ""}`
      : "Belum ada Production Order pada akun demo ini. Anda dapat mengisi form lalu menyimpannya sebagai draft atau mengirimkannya ke Manager.";
  }
  if (/produk|product|katalog/.test(query)) {
    return products.length
      ? `Katalog demo: ${products.map((product) => `${product.id} ${product.name} (${product.finished_goods_on_hand} ${product.unit} stok barang jadi)`).join("; ")}. Jumlah tersebut hanya snapshot stok barang jadi, bukan ketersediaan bahan baku.`
      : "Katalog produk belum tersedia.";
  }
  if (/estimasi|estimate|target|jumlah|produksi|prediksi/.test(query)) {
    return "Estimasi pada simulasi memakai baseline kapasitas katalog, bukan prediksi AI atau jaminan waktu. Ketersediaan bahan baku dan antrean produksi belum dimodelkan; Manager perlu memeriksanya sebelum menjadwalkan order.";
  }
  return "Saya dapat membantu informasi katalog produk, estimasi kapasitas demo, serta status Production Order milik Anda. Untuk demo ini jawaban bersifat simulasi.";
}

export const CustomerHome = () => {
  const navigate = useNavigate();
  const role = currentOrderRole();
  const demo = isDemoSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [lines, setLines] = useState<EditableLine[]>([
    { key: 1, product_id: "", quantity: 1 },
  ]);
  const [nextKey, setNextKey] = useState(2);
  const [targetAt, setTargetAt] = useState(() =>
    localDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  );
  const [minimumTargetAt] = useState(() =>
    localDateTimeValue(new Date(Date.now() + 60_000)),
  );
  const [notes, setNotes] = useState("");
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<
    "DRAFT" | "REVISION_REQUESTED" | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatTurn[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const refresh = async () => {
    const [availableProducts, customerOrders] = await Promise.all([
      productionOrderService.getProducts(),
      productionOrderService.getOrders(),
    ]);
    setProducts(availableProducts);
    setOrders(customerOrders);
  };

  useEffect(() => {
    void refresh()
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Data permintaan tidak dapat dimuat.",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  if (role !== "customer") {
    return <Navigate to="/" replace />;
  }

  const resetForm = () => {
    setLines([{ key: nextKey, product_id: "", quantity: 1 }]);
    setNextKey((key) => key + 1);
    setTargetAt(localDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
    setNotes("");
    setEditingOrderId(null);
    setEditingStatus(null);
  };

  const saveOrder = async (action: "draft" | "submit") => {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const details: OrderDetails = {
        items: lines.map(({ product_id, quantity }) => ({ product_id, quantity })),
        target_at: new Date(targetAt).toISOString(),
        notes,
      };
      if (editingStatus === "DRAFT" && editingOrderId) {
        await productionOrderService.updateDraft(editingOrderId, details);
        if (action === "submit") {
          await productionOrderService.submitDraft(editingOrderId);
          setNotice("Draft berhasil dikirim ke Manager.");
        } else {
          setNotice("Draft berhasil diperbarui.");
        }
      } else if (editingStatus === "REVISION_REQUESTED" && editingOrderId) {
        await productionOrderService.resubmitOrder(editingOrderId, details);
        setNotice("Revisi berhasil dikirim kembali ke Manager.");
      } else if (action === "draft") {
        await productionOrderService.createDraft(details);
        setNotice("Permintaan berhasil disimpan sebagai draft.");
      } else {
        await productionOrderService.createOrder(details);
        setNotice("Permintaan produksi berhasil dikirim ke Manager.");
      }
      resetForm();
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Permintaan tidak dapat dikirim.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submitOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveOrder("submit");
  };

  const beginRevision = (order: ProductionOrder) => {
    setEditingOrderId(order.id);
    setEditingStatus(order.status === "DRAFT" ? "DRAFT" : "REVISION_REQUESTED");
    setLines(
      order.items.map((item, index) => ({
        key: index + nextKey,
        product_id: item.product_id,
        quantity: item.quantity,
      })),
    );
    setNextKey((key) => key + order.items.length);
    setTargetAt(localDateTimeValue(new Date(order.target_at)));
    setNotes(order.notes);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const signOut = async () => {
    try {
      if (!demo) {
        const apiOrigin =
          import.meta.env.VITE_API_URL || "http://localhost:8000";
        const response = await fetch(`${apiOrigin}/api/auth/logout`, {
          method: "POST",
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(`Logout failed (${response.status})`);
        }
        sessionStorage.removeItem("maestro_auth_role");
      }
      sessionStorage.removeItem("maestro_demo_role");
      navigate("/");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Logout gagal.",
      );
    }
  };

  const sendCustomerMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = chatDraft.trim();
    if (!message || chatSending) return;
    setChatDraft("");
    setChatError(null);
    setChatSending(true);
    const previousMessages = chatMessages;
    setChatMessages([...previousMessages, { role: "user", content: message }]);
    try {
      const answer = demo
        ? demoCustomerAnswer(message, products, orders)
        : (
            await apiDataProvider.chatWithCustomerAssistant(
              message,
              previousMessages.slice(-8),
            )
          ).answer;
      setChatMessages((current) => [
        ...current,
        { role: "assistant", content: answer },
      ]);
    } catch (requestError) {
      setChatError(
        requestError instanceof Error
          ? requestError.message
          : "Asisten order tidak dapat menjawab saat ini.",
      );
    } finally {
      setChatSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-neo-bg p-6 md:p-12">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b-[3px] border-neo-black pb-5">
        <div>
          <h1 className="m-0 text-3xl tracking-widest">MAESTRO</h1>
          <p className="m-0 font-mono text-xs font-bold">CUSTOMER PORTAL</p>
        </div>
        <div className="flex items-center gap-3">
          {demo && (
            <span className="border-2 border-neo-black bg-neo-yellow px-2 py-1 font-mono text-xs font-black">
              SIMULASI
            </span>
          )}
          <button className="neo-btn" onClick={() => void signOut()} type="button">
            {demo ? "GANTI ROLE" : "SIGN OUT"}
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="neo-card h-fit bg-white p-6 md:p-8">
          <div className="mb-5 flex items-center gap-3">
            <ClipboardList size={28} />
            <div>
              <h2 className="m-0 text-2xl">
                {editingStatus === "DRAFT"
                  ? "Edit Draft"
                  : editingStatus === "REVISION_REQUESTED"
                    ? "Revisi Permintaan"
                    : "Permintaan Produksi"}
              </h2>
              <p className="m-0 font-mono text-xs text-neo-muted">
                Pilih produk, jumlah, dan target waktu
              </p>
            </div>
          </div>

          <form className="space-y-5" onSubmit={submitOrder}>
            <div className="space-y-3">
              {lines.map((line) => (
                <div
                  className="grid gap-3 border-2 border-neo-black bg-neo-bg p-3 sm:grid-cols-[minmax(0,1fr)_110px_40px]"
                  key={line.key}
                >
                  <label className="font-mono text-xs font-bold">
                    PRODUK
                    <select
                      className="mt-1 w-full border-2 border-neo-black bg-white p-2 font-sans text-sm"
                      required
                      value={line.product_id}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((item) =>
                            item.key === line.key
                              ? { ...item, product_id: event.target.value }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="">Pilih produk...</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.id} — {product.name} (stok barang jadi:{" "}
                          {product.finished_goods_on_hand} {product.unit})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="font-mono text-xs font-bold">
                    QUANTITY
                    <input
                      className="mt-1 w-full border-2 border-neo-black p-2 font-sans text-sm"
                      type="number"
                      min={1}
                      max={100_000}
                      required
                      value={line.quantity}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((item) =>
                            item.key === line.key
                              ? {
                                  ...item,
                                  quantity: Number(event.target.value),
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    aria-label="Hapus produk"
                    className="mt-5 flex h-10 w-10 items-center justify-center border-2 border-neo-black bg-white hover:bg-red-100 disabled:opacity-40"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((item) => item.key !== line.key),
                      )
                    }
                    type="button"
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
              <button
                className="flex items-center gap-2 font-mono text-xs font-bold underline"
                onClick={() => {
                  setLines((current) => [
                    ...current,
                    { key: nextKey, product_id: "", quantity: 1 },
                  ]);
                  setNextKey((key) => key + 1);
                }}
                type="button"
              >
                <Plus size={15} /> TAMBAH PRODUK
              </button>
            </div>

            <label className="block font-mono text-xs font-bold">
              TARGET SELESAI
              <input
                className="mt-1 w-full border-2 border-neo-black p-3 font-sans text-sm"
                type="datetime-local"
                min={minimumTargetAt}
                required
                value={targetAt}
                onChange={(event) => setTargetAt(event.target.value)}
              />
            </label>
            <label className="block font-mono text-xs font-bold">
              CATATAN (OPSIONAL)
              <textarea
                className="mt-1 w-full border-2 border-neo-black p-3 font-sans text-sm"
                maxLength={1000}
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>

            <p className="border-2 border-neo-black bg-neo-yellow p-3 font-mono text-xs leading-5">
              Estimasi kapasitas ini hanya aturan demo, bukan prediksi AI atau
              jaminan waktu. Stok adalah snapshot barang jadi, tidak direservasi
              atau dikurangi. Bahan baku belum dihitung dan perlu diperiksa Manager.
            </p>
            {(error || notice) && (
              <p
                className={`border-2 border-neo-black p-3 font-mono text-sm ${error ? "bg-red-100 text-red-800" : "bg-green-100 text-green-900"}`}
              >
                {error || notice}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {editingStatus !== "REVISION_REQUESTED" && (
                <button
                  className="neo-btn"
                  disabled={submitting || products.length === 0}
                  onClick={(event) => {
                    if (event.currentTarget.form?.reportValidity()) {
                      void saveOrder("draft");
                    }
                  }}
                  type="button"
                >
                  SIMPAN DRAFT
                </button>
              )}
              <button
                className="neo-btn neo-btn-primary flex items-center gap-2"
                disabled={submitting || products.length === 0}
                type="submit"
              >
                <Send size={16} />
                {submitting
                  ? "MENGIRIM..."
                  : editingStatus === "REVISION_REQUESTED"
                    ? "KIRIM REVISI"
                    : "KIRIM KE MANAGER"}
              </button>
              {editingOrderId && (
                <button className="neo-btn" onClick={resetForm} type="button">
                BATAL EDIT
                </button>
              )}
            </div>
            {role !== "customer" && (
              <p className="font-mono text-xs text-red-700">
                Sesi ini bukan Customer. API akan menolak pembuatan permintaan.
              </p>
            )}
          </form>
        </section>

        <section className="space-y-4">
          <header className="flex items-end justify-between gap-3">
            <div>
              <h2 className="m-0 text-2xl">Permintaan Saya</h2>
              <p className="m-0 font-mono text-xs text-neo-muted">
                Status dan keputusan Manager
              </p>
            </div>
            <span className="neo-badge">{orders.length} ORDER</span>
          </header>

          {loading && (
            <div className="neo-card bg-white p-5 font-mono text-sm">
              Memuat produk dan permintaan...
            </div>
          )}
          {!loading && orders.length === 0 && (
            <div className="neo-card bg-white p-5 font-mono text-sm text-neo-muted">
              Belum ada permintaan produksi.
            </div>
          )}
          {orders.map((order) => (
            <article className="neo-card bg-white p-5" key={order.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="m-0 font-mono text-xs text-neo-muted">{order.id}</p>
                  <h3 className="mb-1 mt-1 text-lg">{statusLabel(order.status)}</h3>
                </div>
                <span
                  className={`neo-badge ${order.status === "REJECTED" ? "neo-badge-critical" : order.status === "COMPLETED" ? "neo-badge-success" : order.status === "REVISION_REQUESTED" ? "neo-badge-warning" : "neo-badge-info"}`}
                >
                  {order.status.replaceAll("_", " ")}
                </span>
              </div>
              <div className="my-3 space-y-1 border-y-2 border-neo-silver py-3">
                {order.items.map((item, index) => (
                  <p className="m-0 font-mono text-sm" key={`${item.product_id}-${index}`}>
                    {item.product_id} · {item.product_name} —{" "}
                    <strong>
                      {item.quantity} {item.unit}
                    </strong>
                  </p>
                ))}
              </div>
              <dl className="grid grid-cols-2 gap-3 font-mono text-xs">
                <div>
                  <dt className="text-neo-muted">TARGET</dt>
                  <dd className="m-0 font-bold">
                    {new Date(order.target_at).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-neo-muted">ESTIMASI KAPASITAS DEMO</dt>
                  <dd
                    className={`m-0 font-bold ${order.estimate_is_feasible ? "text-green-800" : "text-red-700"}`}
                  >
                    {order.estimated_hours} jam ·{" "}
                    {order.estimate_is_feasible ? "Target cukup" : "Target berisiko"}
                  </dd>
                </div>
                {order.machine_id && (
                  <div>
                    <dt className="text-neo-muted">MESIN</dt>
                    <dd className="m-0 font-bold">{order.machine_id}</dd>
                  </div>
                )}
                {order.scheduled_start && order.scheduled_end && (
                  <div className="col-span-2">
                    <dt className="text-neo-muted">JADWAL PRODUKSI</dt>
                    <dd className="m-0 font-bold">
                      {new Date(order.scheduled_start).toLocaleString()} —{" "}
                      {new Date(order.scheduled_end).toLocaleString()}
                    </dd>
                  </div>
                )}
              </dl>
              <p className="mb-0 mt-3 font-mono text-xs leading-5">
                {order.estimate_summary}
              </p>
              {order.manager_note && (
                <p className="mt-3 border-2 border-neo-black bg-neo-silver p-3 font-mono text-xs">
                  <strong>CATATAN MANAGER:</strong> {order.manager_note}
                </p>
              )}
              {order.status === "REVISION_REQUESTED" && (
                <button
                  className="neo-btn neo-btn-primary mt-3"
                  onClick={() => beginRevision(order)}
                  type="button"
                >
                  REVISI PERMINTAAN
                </button>
              )}
              {order.status === "DRAFT" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="neo-btn"
                    onClick={() => beginRevision(order)}
                    type="button"
                  >
                    EDIT DRAFT
                  </button>
                  <button
                    className="neo-btn neo-btn-primary"
                    onClick={() =>
                      void productionOrderService
                        .submitDraft(order.id)
                        .then(refresh)
                        .then(() =>
                          setNotice("Draft berhasil dikirim ke Manager."),
                        )
                        .catch((requestError: unknown) =>
                          setError(
                            requestError instanceof Error
                              ? requestError.message
                              : "Draft tidak dapat dikirim.",
                          ),
                        )
                    }
                    type="button"
                  >
                    KIRIM DRAFT
                  </button>
                </div>
              )}
              {order.status === "IN_PROGRESS" && (
                <p className="mt-3 border-2 border-neo-black bg-neo-blue p-3 font-mono text-xs font-bold text-white">
                  PRODUKSI BERJALAN DI {order.machine_id}: {order.produced_quantity}/
                  {order.total_quantity}
                </p>
              )}
            </article>
          ))}
        </section>
      </div>
      <section className="neo-card mx-auto mt-8 max-w-5xl bg-white p-5">
        <header className="mb-4 flex items-center gap-3">
          <Bot size={22} />
          <div>
            <h2 className="m-0 text-xl">Asisten Production Order</h2>
            <p className="m-0 font-mono text-xs text-neo-muted">
              {demo
                ? "Simulasi lokal: katalog, estimasi demo, dan order Anda."
                : "Informasi umum, katalog, estimasi, dan Production Order milik Anda."}
            </p>
          </div>
        </header>
        <div
          aria-live="polite"
          className="mb-4 max-h-72 space-y-3 overflow-y-auto border-2 border-neo-black bg-neo-bg p-3"
        >
          {chatMessages.length === 0 && (
            <p className="m-0 font-mono text-sm">
              Tanyakan katalog produk, estimasi, atau status order Anda.
            </p>
          )}
          {chatMessages.map((message, index) => (
            <div
              className={`flex gap-2 font-mono text-sm ${message.role === "user" ? "justify-end" : "justify-start"}`}
              key={`${message.role}-${index}`}
            >
              {message.role === "assistant" && <Bot className="shrink-0" size={17} />}
              <p
                className={`m-0 max-w-[85%] border-2 border-neo-black p-2 ${message.role === "user" ? "bg-neo-yellow" : "bg-white"}`}
              >
                {message.content}
              </p>
              {message.role === "user" && <UserRound className="shrink-0" size={17} />}
            </div>
          ))}
          {chatSending && (
            <p className="m-0 font-mono text-xs">Asisten sedang menjawab...</p>
          )}
        </div>
        {chatError && (
          <p className="mb-3 border-2 border-neo-black bg-red-100 p-2 font-mono text-xs text-red-800">
            {chatError}
          </p>
        )}
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={sendCustomerMessage}
        >
          <input
            aria-label="Pesan untuk asisten order"
            className="min-w-0 flex-1 border-2 border-neo-black p-3 font-mono text-sm"
            maxLength={2000}
            placeholder="Tulis pertanyaan terkait order..."
            required
            value={chatDraft}
            onChange={(event) => setChatDraft(event.target.value)}
          />
          <button
            className="neo-btn neo-btn-primary flex items-center justify-center gap-2"
            disabled={chatSending}
            type="submit"
          >
            <Send size={15} /> KIRIM
          </button>
        </form>
      </section>
    </main>
  );
};
