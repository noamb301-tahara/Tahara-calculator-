import React from "react";
import {
  Bell, BarChart3, Bolt, Bookmark, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, CreditCard, Download,
  Eye, EyeOff, File, FileText, Filter, Folder, Globe, Grid2x2, Heart, House, Image, Key, Layers, LayoutDashboard, Link, List,
  Lock, LogOut, Mail, Menu, MessageSquare, Mic, Minus, MoreHorizontal, MoreVertical, Package, Palette, Pencil, Phone, Play,
  Plus, Search, Send, Settings, Share2, Shield, ShieldCheck, ShoppingCart, SlidersHorizontal, Smartphone, Sparkles, Star, Tag,
  Trash2, TrendingUp, Upload, User, UserPlus, Users, Video, Wallet, X, Zap, Bot, Clock, Copy, ExternalLink, Info, TriangleAlert,
  CircleCheck, Megaphone, Building2, Database, Cloud, Code, Store, Rocket,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Icon registry. ScreenDefinitions refer to icons by these kebab-case names. */
export const ICONS: Record<string, LucideIcon> = {
  bell: Bell, chart: BarChart3, "bar-chart": BarChart3, bolt: Bolt, bookmark: Bookmark, calendar: Calendar, check: Check,
  "chevron-down": ChevronDown, "chevron-left": ChevronLeft, "chevron-right": ChevronRight, help: CircleHelp, "credit-card": CreditCard,
  card: CreditCard, download: Download, eye: Eye, "eye-off": EyeOff, file: File, "file-text": FileText, filter: Filter, folder: Folder,
  globe: Globe, grid: Grid2x2, heart: Heart, home: House, image: Image, key: Key, layers: Layers, dashboard: LayoutDashboard, link: Link,
  list: List, lock: Lock, logout: LogOut, mail: Mail, menu: Menu, message: MessageSquare, mic: Mic, minus: Minus, more: MoreHorizontal,
  "more-vertical": MoreVertical, package: Package, palette: Palette, edit: Pencil, pencil: Pencil, phone: Phone, play: Play, plus: Plus,
  search: Search, send: Send, settings: Settings, share: Share2, shield: Shield, "shield-check": ShieldCheck, cart: ShoppingCart,
  sliders: SlidersHorizontal, smartphone: Smartphone, sparkles: Sparkles, star: Star, tag: Tag, trash: Trash2, trending: TrendingUp,
  upload: Upload, user: User, "user-plus": UserPlus, users: Users, video: Video, wallet: Wallet, x: X, close: X, zap: Zap, bot: Bot,
  clock: Clock, copy: Copy, "external-link": ExternalLink, info: Info, warning: TriangleAlert, "check-circle": CircleCheck,
  megaphone: Megaphone, building: Building2, database: Database, cloud: Cloud, code: Code, store: Store, rocket: Rocket,
};

export const ICON_NAMES = Object.keys(ICONS);

export const Icon: React.FC<{ name?: string; size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties }> = ({
  name,
  size = 24,
  color = "currentColor",
  strokeWidth = 2,
  style,
}) => {
  if (!name) return null;
  const Cmp = ICONS[name];
  if (!Cmp) {
    // Unknown icon: neutral dot so layout stays stable.
    return <span style={{ display: "inline-block", width: size * 0.45, height: size * 0.45, borderRadius: 999, background: color, opacity: 0.5, margin: size * 0.275, ...style }} />;
  }
  return <Cmp size={size} color={color} strokeWidth={strokeWidth} style={{ flexShrink: 0, ...style }} />;
};
