"use client";

import React, { useMemo, useState } from "react";
import { withBasePath } from "@/lib/basePath";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Loader2,
  Pencil,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import type {
  RuleTargetEntityType,
  RuleWeight,
  SchedulingRuleType,
} from "@prisma/client";
import {
  DAYS_OF_WEEK,
  RULE_EXAMPLES,
  RULE_TYPE_META,
  RULE_WEIGHT_META,
} from "@/lib/scheduling/constants";
import type { RuleAssistantRecommendation } from "@/app/api/horarios/rules/assistant/route";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { HelpTip } from "../HelpTip";
import type { SchedulingRuleDTO, SchoolSetupPayload } from "../types";

interface StepReglasProps {
  setup: SchoolSetupPayload;
  onRefresh: () => Promise<void>;
  onNextStep: () => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  recommendation?: RuleAssistantRecommendation | null;
}

const CATEGORY_LABELS = {
  ALL: "Todas",
  DOCENTE: "Docentes",
  PEDAGOGICA: "Pedagógicas",
  INFRAESTRUCTURA: "Infraestructura",
  ESPECIAL: "Especiales",
} as const;

const QUICK_PROMPTS = [
  "¿Cómo bloqueo los martes en la mañana para un docente?",
  "Quiero que Matemática y Lenguaje queden preferentemente en la mañana",
  "¿Cómo fijo Consejo de Curso los miércoles en el bloque 1?",
  "Necesito que todos los profes de un departamento tengan 1 bloque libre juntos",
];

function getDefaultParameters(ruleType: SchedulingRuleType): Record<string, unknown> {
  switch (ruleType) {
    case "TEACHER_UNAVAILABILITY":
      return { unavailableDays: [], unavailableBlocks: [] };
    case "MAX_TEACHER_WINDOWS":
      return { max: 2 };
    case "MAX_CONSECUTIVE_TEACHER_BLOCKS":
      return { max: 4 };
    case "MAX_DAILY_BLOCKS_PER_SUBJECT":
      return { max: 2 };
    case "TEACHER_DAY_COMPACTNESS":
      return { maxDays: 3 };
    case "TEACHER_DAILY_BLOCKS_LIMIT":
      return { min: 2, max: 7 };
    case "TEACHER_GUARANTEED_LUNCH_BREAK":
      return { startBlock: 4, endBlock: 6, minFreeBlocks: 1 };
    case "SYNCED_DEPARTMENT_MEETING":
      return { teacherIds: [], requiredFreeBlocks: 1 };
    case "TEACHER_CAMPUS_TRAVEL":
      return { minGapBlocks: 1 };
    case "SUBJECT_PREFERRED_TIME_RANGE":
      return { period: "MORNING" };
    case "EXTENDED_BLOCKS_POLICY":
      return { blockSize: 3 };
    case "FIXED_SUBJECT_SLOT":
      return { dayOfWeek: 3, blockNumber: 1 };
    case "FIXED_SYNC_GROUP_SLOT":
      return { syncGroupCode: "", dayOfWeek: 3, blockNumbers: [7, 8] };
    case "SUBJECT_MIN_DAY_SPACING":
      return { minDaysBetween: 1 };
    case "MAX_DAILY_COGNITIVE_LOAD":
      return { maxDailyLoad: 10 };
    case "SUBJECT_PRECEDENCE":
      return { prerequisiteSubjectId: "", dependentSubjectId: "" };
    case "ROOM_ACCESSIBILITY_FLOOR":
      return { maxFloor: 1 };
    case "MINIMIZE_COURSE_ROOM_CHANGES":
      return { maxChangesPerDay: 1 };
    case "LEY_20903_POLICY":
      return {
        defaultRatio: "65_35",
        apply6040ToBasic1to4: false,
        includeBreaksInTeaching: true,
        breakMinutesPerBlock: 4,
        blockDurationMinutes: 0,
        strictEnforcement: false,
      };
    default:
      return {};
  }
}

function defaultTargetTypeForRule(ruleType: SchedulingRuleType): RuleTargetEntityType {
  if (ruleType === "TEACHER_UNAVAILABILITY") return "TEACHER";
  if (
    ruleType === "SUBJECT_PREFERRED_TIME_RANGE" ||
    ruleType === "FIXED_SUBJECT_SLOT" ||
    ruleType === "EXTENDED_BLOCKS_POLICY" ||
    ruleType === "SUBJECT_MIN_DAY_SPACING" ||
    ruleType === "NO_SUBJECT_POST_LUNCH"
  ) {
    return "SUBJECT";
  }
  return "GLOBAL";
}

function renderFormattedReply(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={idx} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={idx}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function RuleWeightBadge({
  weight,
  penaltyScore,
  className,
}: {
  weight: RuleWeight;
  penaltyScore?: number;
  className?: string;
}) {
  const meta = RULE_WEIGHT_META[weight];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={weight === "HARD" ? "destructive" : "outline"}
          className={`cursor-help ${className ?? ""}`}
        >
          {meta.label}
          {weight === "SOFT" && penaltyScore !== undefined ? ` (${penaltyScore})` : ""}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        {meta.description}
      </TooltipContent>
    </Tooltip>
  );
}

export function StepReglas({ setup, onRefresh, onNextStep }: StepReglasProps) {
  const { showToast } = useToast();
  const [subTab, setSubTab] = useState<string>("catalogo");
  const [category, setCategory] = useState<keyof typeof CATEGORY_LABELS>("ALL");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  // Chat IA OpenAI
  const [chatExpanded, setChatExpanded] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Modal de configuración de regla
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | undefined>(undefined);
  const [ruleType, setRuleType] = useState<SchedulingRuleType>("TEACHER_UNAVAILABILITY");
  const [weight, setWeight] = useState<RuleWeight>("HARD");
  const [penaltyScore, setPenaltyScore] = useState<number>(100);
  const [targetEntityType, setTargetEntityType] =
    useState<RuleTargetEntityType>("GLOBAL");
  const [targetEntityId, setTargetEntityId] = useState<string>("");
  const [parameters, setParameters] = useState<Record<string, unknown>>({});

  const visibleActiveRules = useMemo(
    () => setup.rules.filter((r) => r.ruleType !== "ROOM_ASSIGNMENT_MODE"),
    [setup.rules]
  );

  const activeCountByType = useMemo(() => {
    const map = new Map<SchedulingRuleType, number>();
    for (const r of visibleActiveRules) {
      map.set(r.ruleType, (map.get(r.ruleType) ?? 0) + 1);
    }
    return map;
  }, [visibleActiveRules]);

  const syncGroups = useMemo(() => {
    const set = new Set<string>();
    for (const c of setup.courses) {
      for (const cs of c.courseSubjects) {
        if (cs.syncGroupCode) set.add(cs.syncGroupCode);
      }
    }
    return Array.from(set).sort();
  }, [setup.courses]);

  const maxBlocksInGrid = useMemo(() => {
    let max = 8;
    for (const b of setup.bellSchedules) {
      for (const s of b.timeSlots) {
        if (s.slotType === "CLASS" && s.blockNumber > max) max = s.blockNumber;
      }
    }
    return Math.min(12, max);
  }, [setup.bellSchedules]);

  const catalogRules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (Object.keys(RULE_TYPE_META) as SchedulingRuleType[])
      .filter((rt) => rt !== "ROOM_ASSIGNMENT_MODE")
      .filter((rt) => {
        const meta = RULE_TYPE_META[rt];
        if (category !== "ALL" && meta.category !== category) return false;
        if (q) {
          const text = `${meta.label} ${meta.description} ${(RULE_EXAMPLES[rt] ?? []).join(" ")}`.toLowerCase();
          if (!text.includes(q)) return false;
        }
        return true;
      });
  }, [category, search]);

  const openConfigureNew = (rt: SchedulingRuleType) => {
    const meta = RULE_TYPE_META[rt];
    setEditingRuleId(undefined);
    setRuleType(rt);
    setWeight(meta.defaultWeight);
    setPenaltyScore(meta.defaultPenalty);
    const tType = defaultTargetTypeForRule(rt);
    setTargetEntityType(tType);
    setTargetEntityId(
      tType === "TEACHER"
        ? setup.teachers[0]?.id ?? ""
        : tType === "SUBJECT"
          ? setup.subjects[0]?.id ?? ""
          : ""
    );
    setParameters(getDefaultParameters(rt));
    setDialogOpen(true);
  };

  const openFromRecommendation = (rec: RuleAssistantRecommendation) => {
    setEditingRuleId(undefined);
    setRuleType(rec.ruleType);
    setWeight(rec.weight);
    setPenaltyScore(rec.penaltyScore);
    setTargetEntityType(rec.targetEntityType);
    setTargetEntityId(rec.targetEntityId ?? "");
    setParameters({
      ...getDefaultParameters(rec.ruleType),
      ...rec.parameters,
    });
    setDialogOpen(true);
  };

  const openEditRule = (rule: SchedulingRuleDTO) => {
    setEditingRuleId(rule.id);
    setRuleType(rule.ruleType);
    setWeight(rule.weight);
    setPenaltyScore(rule.penaltyScore);
    setTargetEntityType(rule.targetEntityType);
    setTargetEntityId(rule.targetEntityId ?? "");
    setParameters({
      ...getDefaultParameters(rule.ruleType),
      ...(rule.parameters ?? {}),
    });
    setDialogOpen(true);
  };

  const handleSaveRule = async () => {
    setBusy(true);
    try {
      const res = await fetch(withBasePath("/api/horarios/setup/entities"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "rule",
          data: {
            id: editingRuleId,
            ruleType,
            weight,
            penaltyScore: weight === "HARD" ? 100 : Number(penaltyScore) || 20,
            targetEntityType,
            targetEntityId:
              targetEntityType === "GLOBAL" ? null : targetEntityId || null,
            parameters,
          },
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "No se pudo guardar la regla.");
      showToast({
        variant: "success",
        title: editingRuleId ? "Regla actualizada" : "Regla agregada",
        description: RULE_TYPE_META[ruleType].label,
      });
      setDialogOpen(false);
      await onRefresh();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error en la regla",
        description: err instanceof Error ? err.message : "Verifica los parámetros.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRule = async (rule: SchedulingRuleDTO) => {
    setBusy(true);
    try {
      const res = await fetch(
        withBasePath(`/api/horarios/setup/entities?entity=rule&id=${rule.id}`),
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("No se pudo eliminar.");
      showToast({
        variant: "success",
        title: "Regla eliminada",
        description: RULE_TYPE_META[rule.ruleType].label,
      });
      await onRefresh();
    } catch (err) {
      showToast({
        variant: "error",
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo eliminar.",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSendChat = async (textOverride?: string) => {
    const query = (textOverride ?? chatInput).trim();
    if (!query || chatLoading) return;
    const userMsg: ChatMessage = {
      id: `${Date.now()}-u`,
      role: "user",
      content: query,
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch(withBasePath("/api/horarios/rules/assistant"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: query,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = (await res.json()) as {
        reply?: string;
        recommendation?: RuleAssistantRecommendation | null;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "El asistente no pudo responder.");
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-a`,
          role: "assistant",
          content: data.reply || "Sin respuesta.",
          recommendation: data.recommendation ?? null,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-e`,
          role: "assistant",
          content:
            err instanceof Error
              ? `Error: ${err.message}`
              : "No se pudo conectar con el asistente de OpenAI.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const resolveEntityName = (rule: SchedulingRuleDTO): string => {
    if (rule.targetEntityType === "GLOBAL" || !rule.targetEntityId) return "Global";
    if (rule.targetEntityType === "TEACHER") {
      const t = setup.teachers.find((x) => x.id === rule.targetEntityId);
      return t ? `${t.firstName} ${t.lastName}` : "Docente";
    }
    if (rule.targetEntityType === "SUBJECT") {
      const s = setup.subjects.find((x) => x.id === rule.targetEntityId);
      return s ? s.name : "Asignatura";
    }
    if (rule.targetEntityType === "COURSE") {
      const c = setup.courses.find((x) => x.id === rule.targetEntityId);
      return c ? c.name : "Curso";
    }
    if (rule.targetEntityType === "ROOM") {
      const r = setup.rooms.find((x) => x.id === rule.targetEntityId);
      return r ? r.name : "Sala";
    }
    return "Global";
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full flex-col">
      <Tabs value={subTab} onValueChange={setSubTab} className="flex h-full flex-col">
        {/* Header del paso */}
        <div className="flex items-center justify-between border-b bg-background px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight">7. Reglas</h1>
              <Badge variant="secondary">{visibleActiveRules.length} activas</Badge>
              <HelpTip text="Configura reglas estrictas (obligatorias) o flexibles (prioritarias). Usa el asistente de IA arriba si tienes dudas sobre qué regla aplicar." />
            </div>
            <TabsList className="h-8">
              <TabsTrigger value="catalogo" className="gap-1.5 text-xs">
                <LayoutGrid className="h-3.5 w-3.5" />
                Catálogo de reglas
              </TabsTrigger>
              <TabsTrigger value="activas" className="gap-1.5 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Reglas activas ({visibleActiveRules.length})
              </TabsTrigger>
            </TabsList>
          </div>
          <Button size="sm" onClick={onNextStep}>
            Ir a Resultado
          </Button>
        </div>

        {/* Asistente IA de Reglas (OpenAI) arriba */}
        <div className="shrink-0 border-b bg-muted/25 px-6 py-3">
          <Card className="border-primary/25 bg-card shadow-none">
            <div className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm font-medium">Asistente de Reglas IA</span>
                <Badge variant="outline" className="text-[10px] font-normal">
                  OpenAI
                </Badge>
                <HelpTip text="Pregúntale en lenguaje natural qué restricción necesitas (ej. disponibilidad docente, bloques fijos, prioridades). Te indicará la regla exacta y podrás abrirla preconfigurada." />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => setChatExpanded((v) => !v)}
              >
                {chatExpanded ? (
                  <>
                    Ocultar <ChevronUp className="ml-1 h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    Abrir chat <ChevronDown className="ml-1 h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </div>

            {chatExpanded && (
              <CardContent className="space-y-3 border-t px-4 py-3">
                {messages.length === 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_PROMPTS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => handleSendChat(q)}
                        className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                ) : (
                  <ScrollArea className="max-h-44 pr-3">
                    <div className="space-y-2.5">
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex gap-2.5 ${
                            msg.role === "user" ? "justify-end" : "justify-start"
                          }`}
                        >
                          {msg.role === "assistant" && (
                            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <Bot className="h-3.5 w-3.5" />
                            </div>
                          )}
                          <div
                            className={`max-w-3xl space-y-2 rounded-lg px-3 py-2 text-xs leading-relaxed ${
                              msg.role === "user"
                                ? "bg-primary text-primary-foreground"
                                : "border bg-muted/40 text-foreground"
                            }`}
                          >
                            <p className="whitespace-pre-wrap">
                              {msg.role === "assistant"
                                ? renderFormattedReply(msg.content)
                                : msg.content}
                            </p>
                            {msg.recommendation && (
                              <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-2.5 py-2">
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-foreground">
                                    {RULE_TYPE_META[msg.recommendation.ruleType]?.label}
                                  </p>
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {msg.recommendation.summary} · Prioridad:{" "}
                                    {RULE_WEIGHT_META[msg.recommendation.weight].label}
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  className="h-7 shrink-0 text-xs"
                                  onClick={() =>
                                    openFromRecommendation(msg.recommendation!)
                                  }
                                >
                                  <SlidersHorizontal className="mr-1.5 h-3 w-3" />
                                  Configurar esta regla
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {chatLoading && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Analizando el catálogo de reglas y datos del establecimiento...
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendChat();
                  }}
                  className="flex items-center gap-2"
                >
                  <Input
                    placeholder="Ej. ¿Qué regla uso para que el profesor de Historia no venga los viernes en la tarde?"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={chatLoading}
                    className="h-9 text-xs"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={chatLoading || !chatInput.trim()}
                  >
                    {chatLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </CardContent>
            )}
          </Card>
        </div>

        {/* Sub-paso 7.1: Catálogo de reglas en Cards */}
        <TabsContent value="catalogo" className="m-0 flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b bg-background px-6 py-2.5">
            <div className="flex items-center gap-1.5">
              {(Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map(
                (cat) => (
                  <Button
                    key={cat}
                    size="sm"
                    variant={category === cat ? "default" : "ghost"}
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setCategory(cat)}
                  >
                    {CATEGORY_LABELS[cat]}
                  </Button>
                )
              )}
            </div>
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar regla o ejemplo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6">
            <div className="grid grid-cols-3 gap-4">
              {catalogRules.map((rt) => {
                const meta = RULE_TYPE_META[rt];
                const examples = RULE_EXAMPLES[rt] ?? [];
                const activeCount = activeCountByType.get(rt) ?? 0;

                return (
                  <Card key={rt} className="flex flex-col justify-between">
                    <CardHeader className="space-y-2 pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {CATEGORY_LABELS[meta.category]}
                        </Badge>
                        <div className="flex items-center gap-1.5">
                          {activeCount > 0 && (
                            <Badge className="gap-1 bg-emerald-600 text-[10px] text-white hover:bg-emerald-600">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              {activeCount} activa{activeCount > 1 ? "s" : ""}
                            </Badge>
                          )}
                          <RuleWeightBadge
                            weight={meta.defaultWeight}
                            className="text-[10px]"
                          />
                        </div>
                      </div>
                      <CardTitle className="text-sm font-semibold leading-snug">
                        {meta.label}
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="space-y-2.5 pb-3">
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {meta.description}
                      </p>
                      {examples.length > 0 && (
                        <div className="rounded-md bg-muted/40 p-2.5">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Cuándo usarla
                          </p>
                          <ul className="space-y-1 text-[11px] leading-snug text-foreground/85">
                            {examples.map((ex, i) => (
                              <li key={i} className="flex gap-1.5">
                                <span className="text-primary">•</span>
                                <span>{ex}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>

                    <CardFooter className="border-t pt-3">
                      <Button
                        size="sm"
                        variant={activeCount > 0 ? "outline" : "default"}
                        className="w-full"
                        onClick={() => openConfigureNew(rt)}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Configurar regla
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* Sub-paso 7.2: Reglas activas */}
        <TabsContent value="activas" className="m-0 flex-1 overflow-auto p-6">
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Regla</TableHead>
                  <TableHead className="w-28">Categoría</TableHead>
                  <TableHead className="w-24">Peso</TableHead>
                  <TableHead className="w-44">Alcance</TableHead>
                  <TableHead>Parámetros</TableHead>
                  <TableHead className="w-24 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleActiveRules.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-32 text-center text-sm text-muted-foreground"
                    >
                      Aún no has configurado reglas. Explora el catálogo o consulta al asistente IA.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleActiveRules.map((rule) => {
                    const meta = RULE_TYPE_META[rule.ruleType];
                    return (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">{meta.label}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[11px] font-normal">
                            {CATEGORY_LABELS[meta.category]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <RuleWeightBadge
                            weight={rule.weight}
                            penaltyScore={rule.weight === "SOFT" ? rule.penaltyScore : undefined}
                            className="text-[11px]"
                          />
                        </TableCell>
                        <TableCell className="text-xs">{resolveEntityName(rule)}</TableCell>
                        <TableCell className="max-w-xs truncate font-mono text-[11px] text-muted-foreground">
                          {Object.keys(rule.parameters ?? {}).length === 0
                            ? "Estándar"
                            : JSON.stringify(rule.parameters)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditRule(rule)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteRule(rule)}
                              disabled={busy}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog Configuración de Regla */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {RULE_TYPE_META[ruleType]?.label}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Peso y Alcance */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1 text-xs">
                  Prioridad
                  <HelpTip text="Estricta es obligatoria (no se puede incumplir). Flexible es prioritaria y descuenta puntaje si hay conflicto." />
                </Label>
                <Select
                  value={weight}
                  onValueChange={(v) => {
                    const next = v as RuleWeight;
                    setWeight(next);
                    if (next === "HARD") setPenaltyScore(100);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HARD">Estricta (Obligatoria)</SelectItem>
                    <SelectItem value="SOFT">Flexible (Prioritaria)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Penalización</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="h-8 text-xs"
                  disabled={weight === "HARD"}
                  value={weight === "HARD" ? 100 : penaltyScore}
                  onChange={(e) => setPenaltyScore(Number(e.target.value))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Aplicar a</Label>
                <Select
                  value={targetEntityType}
                  onValueChange={(v) => {
                    const next = v as RuleTargetEntityType;
                    setTargetEntityType(next);
                    setTargetEntityId("");
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GLOBAL">Todo el colegio</SelectItem>
                    <SelectItem value="TEACHER">Un docente</SelectItem>
                    <SelectItem value="SUBJECT">Una asignatura</SelectItem>
                    <SelectItem value="COURSE">Un curso</SelectItem>
                    <SelectItem value="ROOM">Una sala</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {targetEntityType !== "GLOBAL" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Seleccionar entidad</Label>
                <Select value={targetEntityId} onValueChange={setTargetEntityId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Elige una opción..." />
                  </SelectTrigger>
                  <SelectContent>
                    {targetEntityType === "TEACHER" &&
                      setup.teachers.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.firstName} {t.lastName}
                        </SelectItem>
                      ))}
                    {targetEntityType === "SUBJECT" &&
                      setup.subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </SelectItem>
                      ))}
                    {targetEntityType === "COURSE" &&
                      setup.courses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    {targetEntityType === "ROOM" &&
                      setup.rooms.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Parámetros específicos según tipo de regla */}
            {ruleType === "TEACHER_UNAVAILABILITY" && (
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <Label className="text-xs">
                  Marca días completos o bloques en los que el docente NO está disponible
                </Label>
                <div className="overflow-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="p-1 text-left font-medium text-muted-foreground">
                          Bloque
                        </th>
                        {DAYS_OF_WEEK.map((d) => {
                          const days = (parameters.unavailableDays as number[]) ?? [];
                          const isDayOff = days.includes(d.value);
                          return (
                            <th key={d.value} className="p-1 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  const nextDays = isDayOff
                                    ? days.filter((x) => x !== d.value)
                                    : [...days, d.value];
                                  setParameters((p) => ({
                                    ...p,
                                    unavailableDays: nextDays,
                                  }));
                                }}
                                className={`w-full rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                                  isDayOff
                                    ? "bg-destructive text-destructive-foreground"
                                    : "bg-muted hover:bg-muted/80"
                                }`}
                              >
                                {d.short}
                              </button>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: maxBlocksInGrid }, (_, i) => i + 1).map(
                        (block) => (
                          <tr key={block}>
                            <td className="p-1 font-mono text-[11px] text-muted-foreground">
                              B{block}
                            </td>
                            {DAYS_OF_WEEK.map((d) => {
                              const days = (parameters.unavailableDays as number[]) ?? [];
                              const blocks =
                                (parameters.unavailableBlocks as Array<{
                                  day: number;
                                  block: number;
                                }>) ?? [];
                              const dayOff = days.includes(d.value);
                              const blocked =
                                dayOff ||
                                blocks.some((b) => b.day === d.value && b.block === block);
                              return (
                                <td key={d.value} className="p-0.5 text-center">
                                  <button
                                    type="button"
                                    disabled={dayOff}
                                    onClick={() => {
                                      const exists = blocks.some(
                                        (b) => b.day === d.value && b.block === block
                                      );
                                      const nextBlocks = exists
                                        ? blocks.filter(
                                            (b) => !(b.day === d.value && b.block === block)
                                          )
                                        : [...blocks, { day: d.value, block }];
                                      setParameters((p) => ({
                                        ...p,
                                        unavailableBlocks: nextBlocks,
                                      }));
                                    }}
                                    className={`h-6 w-full rounded border text-[10px] transition-colors ${
                                      blocked
                                        ? "border-destructive/50 bg-destructive/20 text-destructive"
                                        : "bg-background hover:bg-muted"
                                    }`}
                                  >
                                    {blocked ? "✕" : ""}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(ruleType === "MAX_TEACHER_WINDOWS" ||
              ruleType === "MAX_CONSECUTIVE_TEACHER_BLOCKS" ||
              ruleType === "MAX_DAILY_BLOCKS_PER_SUBJECT") && (
              <div className="space-y-1.5">
                <Label className="text-xs">Máximo permitido</Label>
                <Input
                  type="number"
                  min={0}
                  max={12}
                  value={Number(parameters.max ?? 2)}
                  onChange={(e) =>
                    setParameters((p) => ({ ...p, max: Number(e.target.value) }))
                  }
                />
              </div>
            )}

            {ruleType === "TEACHER_DAY_COMPACTNESS" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Máximo de días asistidos por semana (1 a 5)</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={Number(parameters.maxDays ?? 3)}
                  onChange={(e) =>
                    setParameters((p) => ({ ...p, maxDays: Number(e.target.value) }))
                  }
                />
              </div>
            )}

            {ruleType === "TEACHER_DAILY_BLOCKS_LIMIT" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Mínimo bloques/día</Label>
                  <Input
                    type="number"
                    min={0}
                    max={8}
                    value={Number(parameters.min ?? 2)}
                    onChange={(e) =>
                      setParameters((p) => ({ ...p, min: Number(e.target.value) }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Máximo bloques/día</Label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={Number(parameters.max ?? 7)}
                    onChange={(e) =>
                      setParameters((p) => ({ ...p, max: Number(e.target.value) }))
                    }
                  />
                </div>
              </div>
            )}

            {ruleType === "TEACHER_GUARANTEED_LUNCH_BREAK" && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Desde bloque</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={Number(parameters.startBlock ?? 4)}
                    onChange={(e) =>
                      setParameters((p) => ({ ...p, startBlock: Number(e.target.value) }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Hasta bloque</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={Number(parameters.endBlock ?? 6)}
                    onChange={(e) =>
                      setParameters((p) => ({ ...p, endBlock: Number(e.target.value) }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Bloques libres</Label>
                  <Input
                    type="number"
                    min={1}
                    max={3}
                    value={Number(parameters.minFreeBlocks ?? 1)}
                    onChange={(e) =>
                      setParameters((p) => ({
                        ...p,
                        minFreeBlocks: Number(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>
            )}

            {ruleType === "SYNCED_DEPARTMENT_MEETING" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Bloques libres simultáneos requeridos</Label>
                  <Input
                    type="number"
                    min={1}
                    max={4}
                    value={Number(parameters.requiredFreeBlocks ?? 1)}
                    onChange={(e) =>
                      setParameters((p) => ({
                        ...p,
                        requiredFreeBlocks: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Docentes del equipo (mínimo 2)</Label>
                  <ScrollArea className="h-36 rounded-md border p-2">
                    {setup.teachers.map((t) => {
                      const ids = (parameters.teacherIds as string[]) ?? [];
                      const checked = ids.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(val) =>
                              setParameters((p) => ({
                                ...p,
                                teacherIds: val
                                  ? [...ids, t.id]
                                  : ids.filter((x) => x !== t.id),
                              }))
                            }
                          />
                          <span>
                            {t.firstName} {t.lastName}
                          </span>
                        </label>
                      );
                    })}
                  </ScrollArea>
                </div>
              </div>
            )}

            {ruleType === "SUBJECT_PREFERRED_TIME_RANGE" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Franja horaria preferida</Label>
                <Select
                  value={String(parameters.period ?? "MORNING")}
                  onValueChange={(v) => setParameters((p) => ({ ...p, period: v }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MORNING">Mañana (Bloques 1 a 4)</SelectItem>
                    <SelectItem value="AFTERNOON">Tarde (Bloques 5 en adelante)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {ruleType === "FIXED_SUBJECT_SLOT" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Día</Label>
                  <Select
                    value={String(parameters.dayOfWeek ?? 3)}
                    onValueChange={(v) =>
                      setParameters((p) => ({ ...p, dayOfWeek: Number(v) }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((d) => (
                        <SelectItem key={d.value} value={String(d.value)}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Número de bloque</Label>
                  <Input
                    type="number"
                    min={1}
                    max={maxBlocksInGrid}
                    value={Number(parameters.blockNumber ?? 1)}
                    onChange={(e) =>
                      setParameters((p) => ({ ...p, blockNumber: Number(e.target.value) }))
                    }
                  />
                </div>
              </div>
            )}

            {ruleType === "FIXED_SYNC_GROUP_SLOT" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Grupo sincronizado</Label>
                    <Input
                      placeholder="Ej. TALLER_JEC"
                      value={String(parameters.syncGroupCode ?? "")}
                      onChange={(e) =>
                        setParameters((p) => ({ ...p, syncGroupCode: e.target.value }))
                      }
                    />
                    {syncGroups.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {syncGroups.map((g) => (
                          <Badge
                            key={g}
                            variant="outline"
                            className="cursor-pointer text-[10px]"
                            onClick={() =>
                              setParameters((p) => ({ ...p, syncGroupCode: g }))
                            }
                          >
                            {g}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Día</Label>
                    <Select
                      value={String(parameters.dayOfWeek ?? 3)}
                      onValueChange={(v) =>
                        setParameters((p) => ({ ...p, dayOfWeek: Number(v) }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS_OF_WEEK.map((d) => (
                          <SelectItem key={d.value} value={String(d.value)}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Bloques fijos</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: maxBlocksInGrid }, (_, i) => i + 1).map((b) => {
                      const arr = (parameters.blockNumbers as number[]) ?? [];
                      const active = arr.includes(b);
                      return (
                        <Button
                          key={b}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          className="h-7 w-10 text-xs"
                          onClick={() =>
                            setParameters((p) => ({
                              ...p,
                              blockNumbers: active
                                ? arr.filter((x) => x !== b)
                                : [...arr, b].sort((x, y) => x - y),
                            }))
                          }
                        >
                          B{b}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {ruleType === "EXTENDED_BLOCKS_POLICY" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Tamaño del bloque extendido (2 a 8)</Label>
                <Input
                  type="number"
                  min={2}
                  max={8}
                  value={Number(parameters.blockSize ?? 3)}
                  onChange={(e) =>
                    setParameters((p) => ({ ...p, blockSize: Number(e.target.value) }))
                  }
                />
              </div>
            )}

            {ruleType === "SUBJECT_MIN_DAY_SPACING" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Días mínimos de separación (1 a 4)</Label>
                <Input
                  type="number"
                  min={1}
                  max={4}
                  value={Number(parameters.minDaysBetween ?? 1)}
                  onChange={(e) =>
                    setParameters((p) => ({
                      ...p,
                      minDaysBetween: Number(e.target.value),
                    }))
                  }
                />
              </div>
            )}

            {ruleType === "MAX_DAILY_COGNITIVE_LOAD" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Carga cognitiva máxima diaria</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={Number(parameters.maxDailyLoad ?? 10)}
                  onChange={(e) =>
                    setParameters((p) => ({
                      ...p,
                      maxDailyLoad: Number(e.target.value),
                    }))
                  }
                />
              </div>
            )}

            {ruleType === "SUBJECT_PRECEDENCE" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Asignatura teórica (previa)</Label>
                  <Select
                    value={String(parameters.prerequisiteSubjectId ?? "")}
                    onValueChange={(v) =>
                      setParameters((p) => ({ ...p, prerequisiteSubjectId: v }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Elegir..." />
                    </SelectTrigger>
                    <SelectContent>
                      {setup.subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Asignatura taller (posterior)</Label>
                  <Select
                    value={String(parameters.dependentSubjectId ?? "")}
                    onValueChange={(v) =>
                      setParameters((p) => ({ ...p, dependentSubjectId: v }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Elegir..." />
                    </SelectTrigger>
                    <SelectContent>
                      {setup.subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {ruleType === "ROOM_ACCESSIBILITY_FLOOR" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Piso máximo permitido</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={Number(parameters.maxFloor ?? 1)}
                  onChange={(e) =>
                    setParameters((p) => ({ ...p, maxFloor: Number(e.target.value) }))
                  }
                />
              </div>
            )}

            {ruleType === "MINIMIZE_COURSE_ROOM_CHANGES" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Cambios de sala máximos por día</Label>
                <Input
                  type="number"
                  min={0}
                  max={8}
                  value={Number(parameters.maxChangesPerDay ?? 1)}
                  onChange={(e) =>
                    setParameters((p) => ({
                      ...p,
                      maxChangesPerDay: Number(e.target.value),
                    }))
                  }
                />
              </div>
            )}

            {ruleType === "TEACHER_CAMPUS_TRAVEL" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Bloques libres mínimos entre sedes</Label>
                <Input
                  type="number"
                  min={0}
                  max={3}
                  value={Number(parameters.minGapBlocks ?? 1)}
                  onChange={(e) =>
                    setParameters((p) => ({
                      ...p,
                      minGapBlocks: Number(e.target.value),
                    }))
                  }
                />
              </div>
            )}

            {ruleType === "LEY_20903_POLICY" && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Proporción base</Label>
                    <Select
                      value={String(parameters.defaultRatio ?? "65_35")}
                      onValueChange={(v) =>
                        setParameters((p) => ({ ...p, defaultRatio: v }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="65_35">65/35 (General)</SelectItem>
                        <SelectItem value="60_40">60/40 (≥ 80% prioritarios)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Recreo por bloque (min)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={20}
                      className="h-8 text-xs"
                      value={Number(parameters.breakMinutesPerBlock ?? 4)}
                      onChange={(e) =>
                        setParameters((p) => ({
                          ...p,
                          breakMinutesPerBlock: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>Aplicar 60/40 automático en 1° a 4° Básico</span>
                  <Switch
                    checked={Boolean(parameters.apply6040ToBasic1to4)}
                    onCheckedChange={(v) =>
                      setParameters((p) => ({ ...p, apply6040ToBasic1to4: v }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>Exigencia estricta (bloquear si excede tope)</span>
                  <Switch
                    checked={Boolean(parameters.strictEnforcement)}
                    onCheckedChange={(v) =>
                      setParameters((p) => ({ ...p, strictEnforcement: v }))
                    }
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveRule} disabled={busy}>
              {editingRuleId ? "Guardar cambios" : "Activar regla"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </TooltipProvider>
  );
}
