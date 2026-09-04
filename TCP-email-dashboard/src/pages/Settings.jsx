import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { getSmtpSettings, updateSmtpSettings, testEmail } from "../api";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { Spinner } from "../components/ui/Misc";
import { useToastStore } from "../store/toast.store";
import { Settings2, Eye, EyeOff, Send, ShieldCheck } from "lucide-react";

function Field({ label, error, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

export default function Settings() {
  const qc    = useQueryClient();
  const toast = useToastStore((s) => s.addToast);
  const [showPass, setShowPass] = useState(false);
  const [testTo,   setTestTo]   = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["smtp"], queryFn: getSmtpSettings });
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  useEffect(() => {
    if (data?.data && Object.keys(data.data).length) {
      reset({
        host:      data.data.host      || "",
        port:      data.data.port      || 587,
        user:      data.data.user      || "",
        pass:      "",
        from_name: data.data.from_name || "ToteTrack",
      });
    }
  }, [data, reset]);

  const save = useMutation({
    mutationFn: updateSmtpSettings,
    onSuccess: () => { qc.invalidateQueries(["smtp"]); toast("SMTP settings saved"); },
    onError: (e) => toast(e.response?.data?.message || "Save failed", "error"),
  });

  const test = useMutation({
    mutationFn: () => testEmail(testTo),
    onSuccess: () => toast("Test email sent successfully ✅"),
    onError: (e) => toast(e.response?.data?.message || "Test failed", "error"),
  });

  const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-50 transition-all shadow-sm";

  if (isLoading) return <Spinner />;

  return (
    <div>

      <Card className="max-w-lg">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
          <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
            <Settings2 size={18} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">SMTP Configuration</h2>
            <p className="text-xs text-slate-500">Outgoing mail server settings</p>
          </div>
        </div>

        <form onSubmit={handleSubmit((d) => save.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="SMTP Host" error={errors.host?.message}>
                <input {...register("host", { required: "Required" })} placeholder="smtp.gmail.com" className={inputClass} />
              </Field>
            </div>
            <Field label="Port" error={errors.port?.message}>
              <input type="number" {...register("port", { required: "Required" })} placeholder="587" className={inputClass} />
            </Field>
          </div>

          <Field label="SMTP Username" error={errors.user?.message}>
            <input {...register("user", { required: "Required" })} placeholder="your@gmail.com" className={inputClass} />
          </Field>

          <Field label="SMTP Password" error={errors.pass?.message}>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                {...register("pass", { required: !data?.data?.id ? "Required" : false })}
                placeholder={data?.data?.id ? "Leave blank to keep current" : "App password"}
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </Field>

          <Field label="Sender Name" error={errors.from_name?.message}>
            <input {...register("from_name", { required: "Required" })} placeholder="ToteTrack" className={inputClass} />
          </Field>

          <Button type="submit" disabled={save.isPending} className="w-full justify-center">
            <ShieldCheck size={15} />
            {save.isPending ? "Saving..." : "Save SMTP Settings"}
          </Button>
        </form>
      </Card>

      <Card className="max-w-lg mt-5">
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100">
          <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center">
            <Send size={16} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Send Test Email</h2>
            <p className="text-xs text-slate-500">Verify your SMTP configuration works</p>
          </div>
        </div>
        <div className="flex gap-3">
          <input
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="recipient@example.com"
            className={inputClass + " flex-1"}
          />
          <Button variant="success" onClick={() => test.mutate()} disabled={!testTo || test.isPending}>
            {test.isPending ? "Sending..." : "Send Test"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
