import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPending } from "../api";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { Spinner, EmptyState, ErrorState } from "../components/ui/Misc";
import { Search, Download } from "lucide-react";

function TcpImage({ image, folderPath }) {
  if (!image || !folderPath) return <span className="text-slate-400 text-xs">—</span>;
  const src = `/api/tcp-image?file=${encodeURIComponent(image)}&folder=${encodeURIComponent(folderPath)}`;
  return (
    <img src={src} alt={image}
      className="w-16 h-16 object-cover rounded cursor-pointer hover:scale-105 transition"
      onClick={() => window._setTcpImage?.(src)}
      onLoad={() => console.log(`[TcpImage] ✅ ${image}`)}
      onError={(e) => { console.error(`[TcpImage] ❌ ${src}`); e.target.style.display = "none"; }}
    />
  );
}
function exportCSV(rows) {
  const header = "id,received_at,message\n";
  const body   = rows.map((r) => `${r.id},"${r.received_at}","${String(r.message).replace(/"/g, '""')}"`).join("\n");
  const blob   = new Blob([header + body], { type: "text/csv" });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement("a"); a.href = url; a.download = "pending.csv"; a.click();
}

export default function PendingMessages() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
const [selectedImage, setSelectedImage] = useState(null);

  useState(() => {
    window._setTcpImage = setSelectedImage;
    return () => { delete window._setTcpImage; };
  }, []);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["pending", page, q],
    queryFn:  () => getPending(page, q),
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  function handleSearch(e) {
    e.preventDefault();
    setQ(search);
    setPage(1);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />
        {data?.rows?.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => exportCSV(data.rows)}>
            <Download size={14} /> Export CSV
          </Button>
        )}
      </div>

      <form onSubmit={handleSearch} className="mb-4 flex gap-3 max-w-sm">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search messages..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-50 transition-all"
          />
        </div>
        <Button type="submit" size="sm">Search</Button>
      </form>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6"><Spinner /></div>
        ) : isError ? (
          <div className="p-6"><ErrorState /></div>
        ) : !data?.rows?.length ? (
          <div className="p-6"><EmptyState message="No pending messages" /></div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-5 py-3 font-semibold w-16">ID</th>
                  <th className="px-5 py-3 font-semibold w-44">Received At</th>
                  <th className="px-5 py-3 font-semibold">Message</th>
                  <th className="px-5 py-3 font-semibold w-20">Port</th>
                  <th className="px-5 py-3 font-semibold">Image</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">{r.id}</td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">{new Date(r.received_at).toLocaleString("en-US", { timeZone: "Asia/Kolkata" })}</td>
                    <td className="px-5 py-3.5 text-slate-700 max-w-md truncate">{r.message}</td>
                    <td className="px-5 py-3.5">
                      {r.port ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">{r.port}</span> : <span className="text-slate-400 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <TcpImage image={r.image} folderPath={r.folder_path} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              <span>Total: <span className="font-semibold text-slate-700">{data.total}</span></span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <span className="px-3 py-1 rounded-md bg-slate-100 text-slate-700 font-medium">{page} / {totalPages}</span>
                <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          </>
        )}
      </Card>
      {selectedImage && (
  <div
    className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
    onClick={() => setSelectedImage(null)}
  >
    <div
      className="relative max-w-4xl max-h-[90vh] p-2"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="absolute -top-10 right-0 text-white text-3xl"
        onClick={() => setSelectedImage(null)}
      >
        ×
      </button>

      <img
        src={selectedImage}
        alt="Full Size"
        className="max-w-full max-h-[85vh] rounded-lg"
      />
    </div>
  </div>
)}
    </div>
  );
}
