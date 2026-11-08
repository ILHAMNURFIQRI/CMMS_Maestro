import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { PackageOpen } from "lucide-react";
import {
  currentOrderRole,
  productionOrderService,
  type Product,
} from "../services/ProductionOrders";

export const ManagerCatalog = () => {
  const role = currentOrderRole();
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    productionOrderService
      .getProducts()
      .then((catalog) => {
        if (active) setProducts(catalog);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Katalog produk tidak dapat dimuat.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (role !== "manager") return <Navigate to="/" replace />;

  return (
    <section className="space-y-5 pb-12">
      <header className="flex items-center gap-3">
        <PackageOpen size={28} />
        <div>
          <h2 className="m-0 inline-block border-[3px] border-neo-black bg-neo-blue px-3 py-2 text-3xl text-white shadow-neo">
            Katalog Produk
          </h2>
          <p className="mb-0 mt-2 font-mono text-sm">
            Informasi produk dan kapasitas referensi untuk peninjauan order.
          </p>
        </div>
      </header>

      <p className="border-2 border-neo-black bg-neo-yellow p-3 font-mono text-xs leading-5">
        Katalog ini saat ini bersifat baca-saja. Stok yang ditampilkan adalah
        snapshot barang jadi, bukan stok bahan baku atau stok yang direservasi.
        Baseline kapasitas bukan prediksi AI.
      </p>

      {error && (
        <p className="border-2 border-neo-black bg-red-100 p-3 font-mono text-sm text-red-800">
          {error}
        </p>
      )}
      {!error && products.length === 0 && (
        <p className="neo-card bg-white p-5 font-mono text-sm">
          Belum ada produk aktif di katalog.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => (
          <article className="neo-card bg-white p-5" key={product.id}>
            <p className="m-0 font-mono text-xs text-neo-muted">{product.id}</p>
            <h3 className="mb-1 mt-1 text-xl">{product.name}</h3>
            <p className="m-0 font-mono text-xs">{product.category}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t-2 border-neo-silver pt-3 font-mono text-xs">
              <div>
                <dt className="text-neo-muted">STOK BARANG JADI</dt>
                <dd className="m-0 text-lg font-bold">
                  {product.finished_goods_on_hand} {product.unit}
                </dd>
              </div>
              <div>
                <dt className="text-neo-muted">KAPASITAS DEMO</dt>
                <dd className="m-0 text-lg font-bold">
                  {product.production_rate_per_hour} {product.unit}/jam
                </dd>
              </div>
            </dl>
            <p className="mb-0 mt-3 font-mono text-xs text-neo-muted">
              Ketersediaan bahan baku: belum dinilai.
            </p>
          </article>
        ))}
      </div>
    </section>
  );
};
