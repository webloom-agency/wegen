import {
  insertProjectAction,
  generateExampleToolSchemaAction,
} from "@/app/api/chat/actions";
import {
  Lightbulb,
  Loader,
  ArrowRight,
  ArrowLeft,
  Check,
  WandSparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { PropsWithChildren, useEffect, useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { safe } from "ts-safe";
import { Button } from "ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "ui/dialog";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { handleErrorWithToast } from "ui/shared-toast";
import { Textarea } from "ui/textarea";
import { SelectModel } from "./select-model";
import { customModelProvider } from "lib/ai/models";
import { cn } from "lib/utils";
import { appStore } from "@/app/store";

interface CreateProjectWithThreadPopupProps {
  threadId: string;
  onCreated?: () => void;
}

// 스텝 정의
interface Step {
  id: number;
  title: string;
  description: string;
}

export function CreateProjectWithThreadPopup({
  threadId,
  children,
  onCreated,
}: PropsWithChildren<CreateProjectWithThreadPopupProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingInstructions, setIsGeneratingInstructions] =
    useState(false);
  const [instructions, setInstructions] = useState("");
  const [name, setName] = useState("");
  const [model, setModel] = useState(
    customModelProvider.modelsInfo[0].models[0].name,
  );
  const [currentStep, setCurrentStep] = useState(1);
  const router = useRouter();
  const modelList = customModelProvider.modelsInfo;
  const currentModelName = appStore((state) => state.model);

  // 스텝 정의
  const steps: Step[] = [
    {
      id: 1,
      title: "Project Name",
      description: "Choose a name for your new project",
    },
    {
      id: 2,
      title: "Model & Instructions",
      description:
        "Select model and define instructions for your project assistant",
    },
  ];

  const nextStep = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCreate = async () => {
    safe(() => setIsLoading(true))
      .map(() =>
        insertProjectAction({
          name,
          instructions: {
            systemPrompt: instructions,
            model,
          } as any,
        }),
      )
      .watch(() => setIsLoading(false))
      .ifOk(() => setIsOpen(false))
      .ifOk(() => toast.success("Project created"))
      .ifOk(() => mutate("projects"))
      .ifOk((project) => router.push(`/project/${project.id}`))
      .ifFail(handleErrorWithToast);
  };

  const handleGenerateInstructions = async () => {
    if (!name.trim()) {
      toast.error("Please enter a project name first");
      return;
    }

    setIsGeneratingInstructions(true);

    try {
      // 가상의 도구 정보 객체
      const dummyToolInfo = {
        name: "project_instruction_generator",
        description: "Generates project instructions based on project name",
        inputSchema: {
          type: "object",
          properties: {
            projectName: {
              type: "string",
              description: "Name of the project",
            },
          },
          required: ["projectName"],
        },
      };

      // generateExampleToolSchemaAction 함수 호출
      const result = await generateExampleToolSchemaAction({
        modelName: currentModelName || model,
        toolInfo: dummyToolInfo as any,
        prompt: `Generate a detailed system prompt for a project assistant that will help with a project named "${name}". The response should be in a format that can be directly used as instructions for an AI assistant.`,
      });

      // 결과에서 인스트럭션 추출 (타입 체크 개선)
      if (result) {
        if (typeof result === "object") {
          // 객체인 경우 가능한 필드 확인
          const resultObj = result as Record<string, any>;
          if (resultObj.systemPrompt) {
            setInstructions(resultObj.systemPrompt);
          } else if (resultObj.instructions) {
            setInstructions(resultObj.instructions);
          } else {
            // 적절한 필드가 없으면 JSON 문자열로 변환
            setInstructions(JSON.stringify(result, null, 2));
          }
        } else if (typeof result === "string") {
          // 문자열 그대로 사용
          setInstructions(result);
        } else {
          // 기타 타입은 JSON 문자열로 변환
          setInstructions(JSON.stringify(result, null, 2));
        }
      }

      toast.success("Instructions generated");
    } catch (error) {
      console.error(error);
      handleErrorWithToast(error as Error);
    } finally {
      setIsGeneratingInstructions(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setName("");
      setCurrentStep(1);
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[700px] p-0 bg-card overflow-hidden">
        <div className="flex h-full">
          {/* 왼쪽 사이드바 - 스텝 인디케이터 */}
          <div className="w-1/3 bg-muted p-6 flex flex-col">
            <div className="text-xl font-bold mb-6">Create Project</div>

            <div className="space-y-1 flex-1">
              {steps.map((step) => (
                <div key={step.id} className="flex flex-col mb-6">
                  <div className="flex items-start mb-2">
                    <div
                      className={cn(
                        "flex items-center justify-center rounded-full w-8 h-8 text-sm font-medium border-2 transition-colors mr-3 flex-shrink-0",
                        currentStep === step.id &&
                          "border-primary bg-primary text-primary-foreground",
                        currentStep > step.id &&
                          "border-primary bg-primary text-primary-foreground",
                        currentStep < step.id &&
                          "border-muted-foreground/30 text-muted-foreground/50",
                      )}
                    >
                      {currentStep > step.id ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        step.id
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span
                        className={cn(
                          "font-medium",
                          currentStep === step.id && "text-foreground",
                          currentStep !== step.id && "text-muted-foreground/70",
                        )}
                      >
                        {step.title}
                      </span>
                      <span
                        className={cn(
                          "text-xs mt-0.5",
                          currentStep === step.id && "text-muted-foreground",
                          currentStep !== step.id && "text-muted-foreground/50",
                        )}
                      >
                        {step.description}
                      </span>
                    </div>
                  </div>

                  {step.id < steps.length && (
                    <div className="ml-4 pl-3.5 h-10 border-l-2 border-muted-foreground/20" />
                  )}
                </div>
              ))}
            </div>

            <div className="mt-auto">
              <div className="p-4 bg-background/50 rounded-lg">
                <div className="flex items-start">
                  <Lightbulb className="size-4 text-accent-foreground mt-1 mr-2 flex-shrink-0" />
                  <div className="text-xs text-muted-foreground">
                    <p className="font-semibold text-accent-foreground mb-1">
                      What is a project?
                    </p>
                    A project is a place where you can keep your files and
                    custom instructions all in one spot.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 오른쪽 콘텐츠 */}
          <div className="w-2/3 p-6">
            <div className="mb-6">
              <h3 className="text-xl font-semibold">
                {steps.find((step) => step.id === currentStep)?.title}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {steps.find((step) => step.id === currentStep)?.description}
              </p>
            </div>

            {/* 스텝 1: 프로젝트 이름 */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <Input
                    autoFocus
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="eg. Korea Trip Plan"
                    className="w-full"
                  />
                </div>

                <div className="pt-4 flex justify-end">
                  <DialogClose asChild>
                    <Button variant="ghost" className="mr-2">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button
                    onClick={nextStep}
                    disabled={!name.trim()}
                    className="gap-1"
                  >
                    Continue
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* 스텝 2: 모델 & 인스트럭션 */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="flex flex-col gap-4">
                  {/* 모델 선택 */}
                  <div className="flex justify-between items-center bg-muted/30 p-3 rounded-md">
                    <Label htmlFor="model" className="text-sm">
                      Select Model
                    </Label>
                    <SelectModel
                      model={model}
                      onSelect={setModel}
                      providers={modelList}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 min-w-40 justify-between"
                      >
                        <span>{model}</span>
                        <ArrowRight className="size-3.5" />
                      </Button>
                    </SelectModel>
                  </div>

                  {/* 인스트럭션 */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="instructions" className="text-sm">
                        Instructions
                      </Label>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="gap-1"
                        onClick={handleGenerateInstructions}
                        disabled={isGeneratingInstructions || !name.trim()}
                      >
                        {isGeneratingInstructions ? (
                          <Loader className="size-3.5 animate-spin" />
                        ) : (
                          <WandSparkles className="size-3.5" />
                        )}
                        Generate Instructions
                      </Button>
                    </div>
                    <Textarea
                      id="instructions"
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      placeholder="e.g. You are a Korean travel guide ChatBot. Respond only in Korean, include precise times for every itinerary item, and present transportation, budget, and dining recommendations succinctly in a table format."
                      className="resize-none min-h-[180px] w-full"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={prevStep}
                    className="gap-1"
                  >
                    <ArrowLeft className="size-4" />
                    Back
                  </Button>

                  <div className="flex gap-2">
                    <DialogClose asChild>
                      <Button variant="ghost">Cancel</Button>
                    </DialogClose>
                    <Button
                      disabled={isLoading}
                      onClick={handleCreate}
                      className="gap-1"
                    >
                      {isLoading && <Loader className="size-4 animate-spin" />}
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
