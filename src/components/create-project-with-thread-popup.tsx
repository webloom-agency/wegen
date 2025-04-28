import {
  Lightbulb,
  Loader,
  ArrowRight,
  ArrowLeft,
  Check,
  ChevronsUpDown,
  WandSparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { PropsWithChildren, useEffect, useMemo, useState } from "react";

import { Button } from "ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "ui/dialog";
import { Input } from "ui/input";
import { Label } from "ui/label";
import { Textarea } from "ui/textarea";
import { SelectModel } from "./select-model";
import { customModelProvider } from "lib/ai/models";
import { cn } from "lib/utils";
import { appStore } from "@/app/store";
import { useObjectState } from "@/hooks/use-object-reducer";
import { safe } from "ts-safe";

interface CreateProjectWithThreadPopupProps {
  threadId: string;
  onCreated?: () => void;
}

function ProjectNameStep({
  name,
  setName,
  nextStep,
}: {
  name: string;
  setName: (name: string) => void;
  nextStep: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
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

      <div className="pt-4 flex justify-end mt-auto">
        <DialogClose asChild>
          <Button variant="ghost" className="mr-2">
            Cancel
          </Button>
        </DialogClose>
        <Button onClick={nextStep} disabled={!name.trim()} className="gap-1">
          Continue
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function InstructionsStep({
  systemPrompt,
  setSystemPrompt,
  prevStep,
  onSave,
}: {
  systemPrompt: string;
  setSystemPrompt: (systemPrompt: string) => void;
  prevStep: () => void;
  onSave: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const currentModelName = appStore((state) => state.model);
  const [model, setModel] = useState(currentModelName);
  const modelList = useMemo(() => customModelProvider.modelsInfo, []);

  const generateInstructions = () => {
    safe(() => setIsLoading(true)).watch(() => setIsLoading(false));
    // if (!projectOption.name.trim()) {
    //   toast.error("Please enter a project name first");
    //   return;
    // }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center bg-muted/30 p-3 rounded-md">
        <Label htmlFor="model" className="text-sm">
          Select Model
        </Label>
        <SelectModel model={model} onSelect={setModel} providers={modelList}>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1 min-w-40 justify-between"
          >
            <span>{model}</span>
            <ChevronsUpDown className="size-3.5" />
          </Button>
        </SelectModel>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Label htmlFor="instructions" className="text-sm">
            Instructions
          </Label>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1 text-xs"
            onClick={generateInstructions}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader className="size-3.5 animate-spin" />
            ) : (
              <WandSparkles className="size-3.5" />
            )}
            Generate Instructions
          </Button>
        </div>
        <Textarea
          id="instructions"
          value={systemPrompt}
          disabled={isLoading}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="e.g. You are a Korean travel guide ChatBot. Respond only in Korean, include precise times for every itinerary item, and present transportation, budget, and dining recommendations succinctly in a table format."
          className="resize-none min-h-[180px] w-full"
        />
      </div>

      <div className="flex justify-between mt-auto">
        <Button
          type="button"
          variant="secondary"
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
          <Button disabled={isLoading} onClick={onSave} className="gap-1">
            {isLoading && <Loader className="size-4 animate-spin" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CreateProjectWithThreadPopup({
  threadId,
  children,
  onCreated,
}: PropsWithChildren<CreateProjectWithThreadPopupProps>) {
  const [isOpen, setIsOpen] = useState(false);

  const [projectOption, setProjectOption] = useObjectState({
    name: "",
    instructions: "",
    loading: false,
    currentStep: 1,
  });

  const router = useRouter();

  const prevStep = () => {
    if (projectOption.currentStep > 1) {
      setProjectOption({
        currentStep: projectOption.currentStep - 1,
      });
    }
  };
  const nextStep = () => {
    if (projectOption.currentStep < steps.length) {
      setProjectOption({
        currentStep: projectOption.currentStep + 1,
      });
    }
  };

  const handleCreate = async () => {
    // safe(() => setIsLoading(true))
    //   .map(() =>
    //     insertProjectAction({
    //       name,
    //       instructions: {
    //         systemPrompt: instructions,
    //         model,
    //       } as any,
    //     }),
    //   )
    //   .watch(() => setIsLoading(false))
    //   .ifOk(() => setIsOpen(false))
    //   .ifOk(() => toast.success("Project created"))
    //   .ifOk(() => mutate("projects"))
    //   .ifOk((project) => router.push(`/project/${project.id}`))
    //   .ifFail(handleErrorWithToast);
  };

  const handleGenerateInstructions = async () => {
    // if (!projectOption.name.trim()) {
    //   toast.error("Please enter a project name first");
    //   return;
    // }
    // setProjectOption({
    //   isGeneratingInstructions: true,
    // });
    // try {
    //   // 가상의 도구 정보 객체
    //   const dummyToolInfo = {
    //     name: "project_instruction_generator",
    //     description: "Generates project instructions based on project name",
    //     inputSchema: {
    //       type: "object",
    //       properties: {
    //         projectName: {
    //           type: "string",
    //           description: "Name of the project",
    //         },
    //       },
    //       required: ["projectName"],
    //     },
    //   };
    //   // generateExampleToolSchemaAction 함수 호출
    //   const result = await generateExampleToolSchemaAction({
    //     modelName: currentModelName || model,
    //     toolInfo: dummyToolInfo as any,
    //     prompt: `Generate a detailed system prompt for a project assistant that will help with a project named "${name}". The response should be in a format that can be directly used as instructions for an AI assistant.`,
    //   });
    //   // 결과에서 인스트럭션 추출 (타입 체크 개선)
    //   if (result) {
    //     if (typeof result === "object") {
    //       // 객체인 경우 가능한 필드 확인
    //       const resultObj = result as Record<string, any>;
    //       if (resultObj.systemPrompt) {
    //         setInstructions(resultObj.systemPrompt);
    //       } else if (resultObj.instructions) {
    //         setInstructions(resultObj.instructions);
    //       } else {
    //         // 적절한 필드가 없으면 JSON 문자열로 변환
    //         setInstructions(JSON.stringify(result, null, 2));
    //       }
    //     } else if (typeof result === "string") {
    //       // 문자열 그대로 사용
    //       setInstructions(result);
    //     } else {
    //       // 기타 타입은 JSON 문자열로 변환
    //       setInstructions(JSON.stringify(result, null, 2));
    //     }
    //   }
    //   toast.success("Instructions generated");
    // } catch (error) {
    //   console.error(error);
    //   handleErrorWithToast(error as Error);
    // } finally {
    //   setProjectOption({
    //     isGeneratingInstructions: false,
    //   });
    // }
  };
  const steps = useMemo(
    () => [
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
    ],
    [],
  );

  const currentStepContent = useMemo(() => {
    return steps.find((step) => step.id === projectOption.currentStep);
  }, [projectOption.currentStep]);

  useEffect(() => {
    if (!isOpen) {
      setProjectOption({
        name: "",
        instructions: "",
        loading: false,
        currentStep: 1,
      });
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[800px] p-0 bg-card overflow-hidden">
        <DialogTitle className="p-0 m-0 hidden">Create Project</DialogTitle>

        <div className="flex h-[60vh]">
          <div className="w-1/3 bg-muted p-6 flex flex-col">
            <div className="text-xl font-bold mb-6">Create Project</div>

            <div className="flex-1">
              {steps.map((step) => (
                <div key={step.id} className="flex flex-col relative pb-4">
                  <div className="flex items-start mb-2">
                    <div
                      className={cn(
                        "flex items-center justify-center rounded-full w-6 h-6 text-sm font-medium border-2 transition-colors mr-3 flex-shrink-0",
                        projectOption.currentStep < step.id
                          ? "border-muted-foreground/30 text-muted-foreground/50"
                          : "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {projectOption.currentStep > step.id ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        step.id
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span
                        className={cn(
                          "font-medium",
                          projectOption.currentStep === step.id
                            ? "text-foreground"
                            : "text-muted-foreground/70",
                        )}
                      >
                        {step.title}
                      </span>
                      <span
                        className={cn(
                          "text-xs mt-0.5",
                          projectOption.currentStep === step.id
                            ? "text-muted-foreground"
                            : "text-muted-foreground/50",
                        )}
                      >
                        {step.description}
                      </span>
                    </div>
                  </div>

                  {step.id < steps.length && (
                    <div className="absolute h-[calc(100%-32px)] w-0.5 bg-muted-foreground left-[11px] top-7" />
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

          <div className="w-2/3 p-6 flex flex-col">
            <div className="mb-6">
              <h3 className="text-xl font-semibold">
                {currentStepContent?.title}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {currentStepContent?.description}
              </p>
            </div>

            {currentStepContent?.id === 1 && (
              <ProjectNameStep
                name={projectOption.name}
                setName={(name) => setProjectOption({ name })}
                nextStep={nextStep}
              />
            )}
            {currentStepContent?.id === 2 && (
              <InstructionsStep
                systemPrompt={projectOption.instructions}
                setSystemPrompt={(instructions) =>
                  setProjectOption({ instructions })
                }
                prevStep={prevStep}
                onSave={handleCreate}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
