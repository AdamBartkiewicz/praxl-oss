"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tag, X, Plus, Check } from "lucide-react";

/**
 * Inline tag editor for a single skill.
 * Shows current tags + a "+" button that opens a popover to add/remove tags.
 */
export function SkillTagEditor({
  skillId,
  currentTags,
  allTags,
  onUpdated,
}: {
  skillId: string;
  currentTags: string[];
  allTags: string[];
  onUpdated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [newTag, setNewTag] = useState("");

  const updateSkill = trpc.skills.update.useMutation({
    onSuccess: () => {
      onUpdated?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleTag = (tag: string) => {
    const has = currentTags.includes(tag);
    const next = has ? currentTags.filter((t) => t !== tag) : [...currentTags, tag];
    updateSkill.mutate({ id: skillId, tags: next });
  };

  const addNewTag = () => {
    const trimmed = newTag.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-");
    if (!trimmed) return;
    if (currentTags.includes(trimmed)) {
      setNewTag("");
      return;
    }
    updateSkill.mutate({ id: skillId, tags: [...currentTags, trimmed] });
    setNewTag("");
  };

  // Tags not currently on this skill
  const availableTags = allTags.filter((t) => !currentTags.includes(t));

  return (
    <div className="flex flex-wrap items-center gap-1">
      {currentTags.map((tag) => (
        <Badge key={tag} variant="outline" className="text-xs gap-1 pr-1">
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleTag(tag);
            }}
            className="rounded-full p-0.5 hover:bg-destructive/10 hover:text-destructive cursor-pointer"
          >
            <X className="size-2.5" />
          </button>
        </Badge>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
          className="inline-flex items-center justify-center size-5 rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer"
          title="Add tag"
        >
          <Plus className="size-3" />
        </PopoverTrigger>
        <PopoverContent
          className="w-52 p-2"
          onClick={(e) => e.stopPropagation()}
          onPointerDownCapture={(e) => e.stopPropagation()}
        >
          {/* New tag input */}
          <div className="flex gap-1 mb-2">
            <Input
              placeholder="New tag..."
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNewTag(); } }}
              className="h-7 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={!newTag.trim() || updateSkill.isPending}
              onClick={addNewTag}
            >
              <Plus className="size-3" />
            </Button>
          </div>

          {/* Existing tags to toggle */}
          {availableTags.length > 0 && (
            <>
              <p className="text-[10px] text-muted-foreground mb-1">Existing tags</p>
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className="w-full flex items-center gap-2 text-left text-xs px-2 py-1 rounded hover:bg-muted transition-colors cursor-pointer"
                  >
                    <Tag className="size-3 text-muted-foreground" />
                    {tag}
                  </button>
                ))}
              </div>
            </>
          )}

          {availableTags.length === 0 && !newTag && (
            <p className="text-[10px] text-muted-foreground text-center py-1">Type to create a new tag</p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
