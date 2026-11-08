import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { BarChart3, ClipboardCheck, PackageOpen } from "lucide-react";
import {
  currentOrderRole,
  productionOrderService,
  type ProductionOrder,
  type Product,
} from "../services/ProductionOrders";

export const ManagerDashboard = () => {
  const role = currentOrderRole();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      productionOrderService.getOrders(),
      productionOrderService.getProducts(),
    ])
      .then(([currentOrders, catalog]) => {
        if (active) {
          setOrders(currentOrders);
          setProducts(catalog);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Ringkasan Manager tidak dapat dimuat.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (role !== "manager") return <Navigate to="/" replace />;

  const counts = [
    {
      label: "Menunggu Validasi",
      value: orders.filter((order) => order.status === "SUBMITTED").length,
      className: "bg-neo-yellow",
    },
    {
      label: "Menunggu Jadwal",
      value: orders.filter((order) => order.status === "APPROVED").length,
      className: "bg-neo-cyan",
    },
    {
      label: "Terjadwal / Berjalan",
      value: orders.filter((order) =>
        ["SCHEDULED", "IN_PROGRESS"].includes(order.status),
      ).length,
      className: "bg-neo-blue text-white",
    },
    {
      label: "Selesai",
      value: orders.filter((order) => order.status === "COMPLETED").length,
      className: "bg-green-200",
    },
  ];

  return (
    <section className="space-y-6 pb-12">
      <header>
        <p className="m-0 font-mono text-xs font-bold uppercase tracking-widest text-neo-muted">
          Manager workspace
        </p>
        <h2 className="mt-1 inline-block border-[3px] border-neo-black bg-neo-blue px-3 py-2 text-3xl text-white shadow-neo">
          Ringkasan Manajerial
        </h2>
        <p className="mb-0 mt-3 max-w-3xl font-mono text-sm">
          Validasi permintaan Customer, tinjau data produksi/MES, dan rencanakan
          order sebelum diteruskan ke Operator.
        </p>
      </header>

      <p className="border-2 border-neo-black bg-neo-yellow p-3 font-mono text-xs leading-5">
        Halaman ini berfokus pada keputusan dan perencanaan Manager. Monitoring
        mesin, alert, energi, dan digital twin berada di workspace Operator.
      </p>

      {error && (
        <p className="border-2 border-neo-black bg-red-100 p-3 font-mono text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {counts.map((count) => (
          <article
            className={`neo-card p-5 ${count.className}`}
            key={count.label}
          >
            <p className="m-0 font-mono text-xs font-bold uppercase">
              {count.label}
            </p>
            <p className="mb-0 mt-2 text-4xl font-black">{count.value}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Link
          className="neo-card flex items-start gap-4 bg-white p-5 transition-transform hover:-translate-y-1"
          to="/app/orders"
        >
          <ClipboardCheck size={26} />
          <div>
            <h3 className="m-0 text-lg">Validasi & Jadwal Order</h3>
            <p className="mb-0 mt-1 font-mono text-xs">
              Tinjau permintaan, berikan keputusan, dan jadwalkan produksi di
              M-16.
            </p>
          </div>
        </Link>
        <Link
          className="neo-card flex items-start gap-4 bg-white p-5 transition-transform hover:-translate-y-1"
          to="/app/production-data"
        >
          <BarChart3 size={26} />
          <div>
            <h3 className="m-0 text-lg">Data Produksi & MES</h3>
            <p className="mb-0 mt-1 font-mono text-xs">
              Tinjau metrik dan ringkasan aktivitas produksi.
            </p>
          </div>
        </Link>
        <Link
          className="neo-card flex items-start gap-4 bg-white p-5 transition-transform hover:-translate-y-1"
          to="/app/products"
        >
          <PackageOpen size={26} />
          <div>
            <h3 className="m-0 text-lg">Katalog Produk</h3>
            <p className="mb-0 mt-1 font-mono text-xs">
              Tinjau produk, stok barang jadi, dan baseline kapasitas.
            </p>
          </div>
        </Link>
      </div>

      <section className="neo-card bg-white p-5">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="m-0 text-xl">Order yang perlu perhatian</h3>
            <p className="m-0 font-mono text-xs text-neo-muted">
              Draft Customer tidak ditampilkan di workspace Manager sebelum
              diajukan.
            </p>
          </div>
          <Link className="font-mono text-xs font-bold underline" to="/app/orders">
            BUKA DAFTAR ORDER
          </Link>
        </header>
        {orders.filter((order) =>
          ["SUBMITTED", "APPROVED", "SCHEDULED", "IN_PROGRESS"].includes(
            order.status,
          ),
        ).length === 0 ? (
          <p className="m-0 font-mono text-sm text-neo-muted">
            Tidak ada order yang menunggu tindakan Manager.
          </p>
        ) : (
          <ul className="m-0 space-y-2 p-0">
            {orders
              .filter((order) =>
                ["SUBMITTED", "APPROVED", "SCHEDULED", "IN_PROGRESS"].includes(
                  order.status,
                ),
              )
              .slice(0, 6)
              .map((order) => (
                <li
                  className="flex flex-wrap justify-between gap-2 border-t-2 border-neo-silver pt-2 font-mono text-sm"
                  key={order.id}
                >
                  <span>
                    <strong>{order.id}</strong>
                    {order.customer_name ? ` · ${order.customer_name}` : ""}
                  </span>
                  <span>{order.status.replaceAll("_", " ")}</span>
                </li>
              ))}
          </ul>
        )}
        <p className="mb-0 mt-4 font-mono text-xs text-neo-muted">
          {products.length} produk aktif di katalog. Angka kapasitas adalah
          baseline demo, bukan hasil AI.
        </p>
      </section>
    </section>
  );
};
