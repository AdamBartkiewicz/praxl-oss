import { db } from "@/db";
import { skills } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Download,
  Layers,
  Tag,
  Monitor,
  GitBranch,
  Copy,
  Share2,
} from "lucide-react";
import Link from "next/link";
import { CopyInstallCommand } from "./copy-install-command";

export default async function ShareSkillPage({
  params,
}: {
  params: Promise<{ skillId: string }>;
}) {
  const { skillId } = await params;

  const skill = await db.query.skills.findFirst({
    where: eq(skills.id, skillId),
  });

  if (!skill) {
    notFound();
  }

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/share/${skill.id}`;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6 md:p-10">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Layers className="size-4" />
          <span className="text-sm font-medium uppercase tracking-wide">
            Shared Skill
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{skill.name}</h1>
        {skill.description && (
          <p className="text-lg text-muted-foreground">{skill.description}</p>
        )}
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline" className="font-mono text-xs">
          <GitBranch className="mr-1 size-3" />
          v{skill.currentVersion}
        </Badge>

        {skill.tags.length > 0 &&
          skill.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              <Tag className="mr-1 size-3" />
              {tag}
            </Badge>
          ))}

        {skill.platformHints.length > 0 &&
          skill.platformHints.map((hint) => (
            <Badge key={hint} variant="secondary" className="text-xs">
              <Monitor className="mr-1 size-3" />
              {hint}
            </Badge>
          ))}
      </div>

      {/* Import this skill */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Share2 className="size-4" />
            Import this Skill to Praxl
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CopyInstallCommand command={shareUrl} />
          <p className="text-xs text-muted-foreground">
            Copy this link and use &quot;Install from Marketplace&quot; in Praxl, or download the ZIP below and import manually.
          </p>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Link
          href={`/api/export/${skill.id}`}
          className={buttonVariants({ variant: "default", size: "default" })}
        >
          <Download className="mr-2 size-4" />
          Download ZIP
        </Link>
      </div>

      {/* SKILL.md content */}
      {skill.content && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">SKILL.md</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg bg-muted/60 p-4 text-sm leading-relaxed">
              <code>{skill.content}</code>
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
