import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { getSchedules, createSchedule, updateSchedule, deleteSchedule } from "../api";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { Badge, Spinner, EmptyState, ErrorState } from "../components/ui/Misc";
import { useToastStore } from "../store/toast.store";
import { Trash2, Plus, Clock } from "lucide-react";

export default function Schedules() {
  const qc    = useQueryClient();
  const toast = useToastStore((s) => s.addToast);
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const { data, isLoading, isError } = useQuery({ queryKey: ["schedules"], queryFn: getSchedules });

  const add = useMutation({
    mutationFn: ({ time }) => createSchedule(time),
    onSuccess: () => { qc.invalidateQueries(["schedules"]); reset(); toast("Schedule added"); },
    onError: (e) => toast(e.response?.data?.message || "Error", "error"),
  });

  const toggle = useMutation({
    mutationFn: ({ id, time, active }) => updateSchedule(id, { time, active: active ? 0 : 1 }),
    onSuccess: () => qc.invalidateQueries(["schedules"]),
  });

  const remove = useMutation({
    mutationFn: (id) => deleteSchedule(id),
    onSuccess: () => { qc.invalidateQueries(["schedules"]); toast("Schedule deleted"); },
  });

  if (isLoading) return <Spinner />;
  if (isError)   return <ErrorState />;

  return (
    <div>

      <Card className="mb-6 max-w-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-7 w-7 rounded-md bg-blue-50 flex items-center justify-center">
            <Plus size={14} className="text-blue-600" />
          </div>
          <h2 className="text-sm font-semibold text-slate-700">Add New Schedule</h2>
        </div>
        <form onSubmit={handleSubmit((d) => add.mutate(d))} className="flex gap-3">
          <div className="flex-1">
            <input
              type="time"
              {...register("time", { required: true })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-50 transition-all"
            />
            {errors.time && <p className="mt-1 text-xs text-red-500">Required</p>}
          </div>
          <Button type="submit" disabled={add.isPending}><Plus size={15} /> Add</Button>
        </form>
      </Card>

      <Card className="p-0 overflow-hidden">
        {!data?.length ? (
          <div className="p-6"><EmptyState message="No schedules configured" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-semibold">Time</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Created</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-slate-400" />
                      <span className="font-mono font-semibold text-slate-800">{s.time}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge color={s.active ? "green" : "slate"}>{s.active ? "Active" : "Disabled"}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">{new Date(s.created_at).toLocaleDateString("en-US", { timeZone: "Asia/Kolkata" })}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => toggle.mutate(s)}>
                        {s.active ? "Disable" : "Enable"}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => remove.mutate(s.id)}>
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
