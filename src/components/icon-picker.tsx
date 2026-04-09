"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  Folder, FolderOpen, Code, Terminal, Globe, Rocket, Sparkles, Brain,
  Shield, Bug, TestTube, FileText, BookOpen, Layers, Zap, Settings,
  Database, Cloud, Lock, Eye, Heart, Star, Flame, Target, Compass,
  Lightbulb, Puzzle, Wrench, Hammer, Paintbrush, Palette, Camera,
  Music, Video, Image, MessageSquare, Mail, Bell, Calendar, Clock,
  Search, Filter, BarChart3, PieChart, Activity, Cpu, Wifi,
  Smartphone, Monitor, Server, GitBranch, GitMerge, Package,
  Box, Archive, Trash2, Download, Upload, RefreshCw, Send,
  Users, UserPlus, Building2, Briefcase, GraduationCap, Award,
  Crown, Gem, Coffee, Pizza, Leaf, Sun, Moon, CloudRain,
  type LucideIcon,
} from "lucide-react";

const ICONS: { name: string; icon: LucideIcon }[] = [
  // Dev
  { name: "code", icon: Code },
  { name: "terminal", icon: Terminal },
  { name: "bug", icon: Bug },
  { name: "test-tube", icon: TestTube },
  { name: "database", icon: Database },
  { name: "server", icon: Server },
  { name: "cpu", icon: Cpu },
  { name: "git-branch", icon: GitBranch },
  { name: "git-merge", icon: GitMerge },
  { name: "package", icon: Package },
  { name: "shield", icon: Shield },
  { name: "lock", icon: Lock },
  // General
  { name: "folder", icon: Folder },
  { name: "folder-open", icon: FolderOpen },
  { name: "file-text", icon: FileText },
  { name: "book-open", icon: BookOpen },
  { name: "layers", icon: Layers },
  { name: "box", icon: Box },
  { name: "archive", icon: Archive },
  // AI / creative
  { name: "sparkles", icon: Sparkles },
  { name: "brain", icon: Brain },
  { name: "lightbulb", icon: Lightbulb },
  { name: "zap", icon: Zap },
  { name: "rocket", icon: Rocket },
  { name: "target", icon: Target },
  { name: "compass", icon: Compass },
  { name: "puzzle", icon: Puzzle },
  // Tools
  { name: "wrench", icon: Wrench },
  { name: "hammer", icon: Hammer },
  { name: "settings", icon: Settings },
  { name: "paintbrush", icon: Paintbrush },
  { name: "palette", icon: Palette },
  { name: "filter", icon: Filter },
  { name: "search", icon: Search },
  // Communication
  { name: "globe", icon: Globe },
  { name: "message-square", icon: MessageSquare },
  { name: "mail", icon: Mail },
  { name: "bell", icon: Bell },
  { name: "send", icon: Send },
  // Analytics
  { name: "bar-chart", icon: BarChart3 },
  { name: "pie-chart", icon: PieChart },
  { name: "activity", icon: Activity },
  { name: "eye", icon: Eye },
  // Business
  { name: "users", icon: Users },
  { name: "user-plus", icon: UserPlus },
  { name: "building", icon: Building2 },
  { name: "briefcase", icon: Briefcase },
  { name: "graduation-cap", icon: GraduationCap },
  { name: "award", icon: Award },
  // Fun
  { name: "heart", icon: Heart },
  { name: "star", icon: Star },
  { name: "flame", icon: Flame },
  { name: "crown", icon: Crown },
  { name: "gem", icon: Gem },
  { name: "coffee", icon: Coffee },
  { name: "leaf", icon: Leaf },
  { name: "sun", icon: Sun },
  { name: "moon", icon: Moon },
];

const ICON_MAP = Object.fromEntries(ICONS.map((i) => [i.name, i.icon]));

export function getIconComponent(name: string): LucideIcon | null {
  return ICON_MAP[name] || null;
}

export function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = search
    ? ICONS.filter((i) => i.name.includes(search.toLowerCase()))
    : ICONS;

  const SelectedIcon = getIconComponent(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex items-center justify-center size-10 rounded-lg border border-input bg-background hover:bg-accent transition-colors cursor-pointer"
      >
        {SelectedIcon ? (
          <SelectedIcon className="size-4 text-muted-foreground" />
        ) : value ? (
          <span className="text-base">{value}</span>
        ) : (
          <Folder className="size-4 text-muted-foreground/50" />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" onClick={(e) => e.stopPropagation()}>
        <Input
          placeholder="Search icons..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs mb-2"
        />
        <div className="grid grid-cols-8 gap-0.5 max-h-48 overflow-y-auto">
          {filtered.map((item) => {
            const Icon = item.icon;
            const selected = value === item.name;
            return (
              <button
                key={item.name}
                type="button"
                title={item.name}
                onClick={() => { onChange(item.name); setOpen(false); setSearch(""); }}
                className={`flex items-center justify-center size-7 rounded transition-colors cursor-pointer ${
                  selected ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="size-3.5" />
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-8 text-center text-[10px] text-muted-foreground py-3">No icons found</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
