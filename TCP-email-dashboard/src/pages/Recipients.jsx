import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { getRecipients, createRecipient, updateRecipient, deleteRecipient } from "../api";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { Badge, Spinner, EmptyState, ErrorState } from "../components/ui/Misc";
import { useToastStore } from "../store/toast.store";
import { Trash2, Plus, Mail } from "lucide-react";

export default function Recipients() {
  const qc    = useQueryClient();
  const toast = useToastStore((s) => s.addToast);
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const { data, isLoading, isError } = useQuery({ queryKey: ["recipients"], queryFn: getRecipients });

  const add = useMutation({
    mutationFn: ({ email }) => createRecipient(email),
    onSuccess: () => { qc.invalidateQueries(["recipients"]); reset(); toast("Recipient added"); },
    onError: (e) => toast(e.response?.data?.message || "Error", "error"),
  });

  const toggle = useMutation({
    mutationFn: ({ id, email, active }) => updateRecipient(id, { email, active: active ? 0 : 1 }),
    onSuccess: () => qc.invalidateQueries(["recipients"]),
  });

  const remove = useMutation({
    mutationFn: (id) => deleteRecipient(id),
    onSuccess: () => { qc.invalidateQueries(["recipients"]); toast("Recipient removed"); },
  });

  if (isLoading) return <Spinner />;
  if (isError)   return <ErrorState />;

  return (
    <div>

      <Card className="mb-6 max-w-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-7 w-7 rounded-md bg-blue-50 flex items-center justify-center">
            <Mail size={14} className="text-blue-600" />
          </div>
          <h2 className="text-sm font-semibold text-slate-700">Add Recipient</h2>
        </div>
        <form onSubmit={handleSubmit((d) => add.mutate(d))} className="flex gap-3">
          <div className="flex-1">
            <input
              type="email"
              placeholder="email@example.com"
              {...register("email", { required: true })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-50 transition-all"
            />
            {errors.email && <p className="mt-1 text-xs text-red-500">Valid email required</p>}
          </div>
          <Button type="submit" disabled={add.isPending}><Plus size={15} /> Add</Button>
        </form>
      </Card>

      <Card className="p-0 overflow-hidden">
        {!data?.length ? (
          <div className="p-6"><EmptyState message="No recipients added" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Added</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-slate-400" />
                      <span className="text-slate-800 font-medium">{r.email}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge color={r.active ? "green" : "slate"}>{r.active ? "Active" : "Disabled"}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">{new Date(r.created_at).toLocaleDateString("en-US", { timeZone: "Asia/Kolkata" })}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => toggle.mutate(r)}>
                        {r.active ? "Disable" : "Enable"}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => remove.mutate(r.id)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
