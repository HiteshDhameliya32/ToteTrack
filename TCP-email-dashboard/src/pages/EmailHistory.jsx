import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getEmailLogs, sendNow } from "../api";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { Badge, Spinner, EmptyState, ErrorState } from "../components/ui/Misc";
import { useToastStore } from "../store/toast.store";
import { Send, ChevronDown, ChevronUp } from "lucide-react";

/* ─── Expandable error cell ──────────────────────────── */
function ErrorCell({ message }) {
  const [expanded, setExpanded] = useState(false);
  if (!message) return <span className="text-slate-300">—</span>;

  const isLong = message.length > 80;
  return (
    <div className="text-xs text-red-500">
      <span className={!expanded && isLong ? "line-clamp-2" : "break-all"}>
        {message}
      </span>
      {isLong && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-0.5 flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
        >
          {expanded
            ? <><ChevronUp size={10} /> Show less</>
            : <><ChevronDown size={10} /> Show more</>}
        </button>
      )}
    </div>
  );
}

export default function EmailHistory() {
  const [page, setPage] = useState(1);
  const qc    = useQueryClient();
  const toast = useToastStore((s) => s.addToast);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["email-logs", page],
    queryFn:  () => getEmailLogs(page),
  });

  const trigger = useMutation({
    mutationFn: sendNow,
    onSuccess: (res) => {
      qc.invalidateQueries(["email-logs"]);
      qc.invalidateQueries(["stats"]);
      const r = res.data.result;
      if (r.skipped) toast(r.reason, "error");
      else toast(`Email sent: ${r.count} records`);
    },
    onError: () => toast("Failed to send email", "error"),
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />
        <Button onClick={() => trigger.mutate()} disabled={trigger.isPending} variant="success">
          <Send size={15} />
          {trigger.isPending ? "Sending..." : "Send Now"}
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6"><Spinner /></div>
        ) : isError ? (
          <div className="p-6"><ErrorState /></div>
        ) : !data?.rows?.length ? (
          <div className="p-6"><EmptyState message="No emails sent yet" /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                    <th className="px-5 py-3 font-semibold whitespace-nowrap">Sent At</th>
                    <th className="px-5 py-3 font-semibold">Action</th>
                    <th className="px-5 py-3 font-semibold">Records</th>
                    <th className="px-5 py-3 font-semibold whitespace-nowrap">Date Range</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold w-80">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.rows.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50 transition-colors align-top">
                      <td className="px-5 py-3.5 text-slate-800 font-medium whitespace-nowrap">
                        {l.sent_at?.replace("T", " ").slice(0, 19)}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 text-xs max-w-xs">
                        {l.action || "—"}
                      </td>
                      <td className="px-5 py-3.5 text-slate-700 whitespace-nowrap">
                        {l.record_count}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 text-xs font-mono whitespace-nowrap">
                        {l.date_from && l.date_to ? `${l.date_from} → ${l.date_to}` : "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge color={
                          l.status === "success" ? "green" :
                          l.status === "skipped" ? "yellow" : "red"
                        }>
                          {l.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <ErrorCell message={l.error_message} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
    </div>
  );
}
