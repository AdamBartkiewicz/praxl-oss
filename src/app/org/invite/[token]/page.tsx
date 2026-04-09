"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const acceptMutation = trpc.org.acceptInvite.useMutation();

  useEffect(() => {
    params.then(({ token }) => {
      acceptMutation.mutate({ token }, {
        onSuccess: () => {
          setStatus("success");
          setTimeout(() => router.push("/org"), 2000);
        },
        onError: (err) => {
          setStatus("error");
          setErrorMsg(err.message);
        },
      });
    });
  }, []); // eslint-disable-line

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center space-y-4 max-w-sm">
        {status === "loading" && (
          <>
            <Loader2 className="size-8 animate-spin text-primary mx-auto" />
            <p className="text-sm font-medium">Accepting invite...</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="size-8 text-emerald-500 mx-auto" />
            <p className="text-sm font-medium">You've joined the organization!</p>
            <p className="text-xs text-muted-foreground">Redirecting to your organizations...</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="size-8 text-destructive mx-auto" />
            <p className="text-sm font-medium">Couldn't accept invite</p>
            <p className="text-xs text-muted-foreground">{errorMsg}</p>
            <Link href="/org"><Button variant="outline" size="sm">Go to Organizations</Button></Link>
          </>
        )}
      </div>
    </div>
  );
}
