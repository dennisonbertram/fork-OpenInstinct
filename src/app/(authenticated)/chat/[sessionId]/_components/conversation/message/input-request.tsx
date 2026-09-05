import type { EveDynamicToolPart, EveMessageInputRequest } from "eve/react";
import { z } from "zod";
import {
  Question,
  QuestionActions,
  QuestionDescription,
  QuestionInput,
  QuestionOption,
  QuestionOptions,
  QuestionPrompt,
  type QuestionResponse,
  QuestionSubmit,
} from "@/components/ai-elements/question";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { InputResponse } from "eve/client";
import type { RespondToAgentInput } from "./types";

export function QuestionRequest({
  canRespond,
  inputRequest,
  inputResponse,
  onInputResponses,
}: {
  readonly canRespond: boolean;
  readonly inputRequest: EveMessageInputRequest;
  readonly inputResponse?: InputResponse;
  readonly onInputResponses: RespondToAgentInput;
}) {
  const selectedOption = inputRequest.options?.find(
    (option) => option.id === inputResponse?.optionId
  );
  const hasOptions = (inputRequest.options?.length ?? 0) > 0;
  const acceptsFreeform = inputRequest.allowFreeform === true || !hasOptions;

  const submitResponse = ({ selectedValues, text }: QuestionResponse) =>
    onInputResponses([
      {
        optionId: selectedValues[0],
        requestId: inputRequest.requestId,
        text,
      },
    ]);

  return (
    <Question
      defaultValue={{
        selectedValues: inputResponse?.optionId ? [inputResponse.optionId] : [],
        text: inputResponse?.text ?? "",
      }}
      disabled={!canRespond || inputResponse !== undefined}
      onSubmit={submitResponse}
    >
      <QuestionPrompt>{inputRequest.prompt}</QuestionPrompt>
      {hasOptions ? (
        <QuestionOptions
          className="flex-col items-stretch"
          aria-label={inputRequest.prompt}
        >
          {inputRequest.options?.map((option) => (
            <QuestionOption
              className="justify-start text-left"
              key={option.id}
              value={option.id}
            >
              <span>
                <span className="block">{option.label}</span>
                {option.description ? (
                  <span className="block type-caption opacity-70">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </QuestionOption>
          ))}
        </QuestionOptions>
      ) : null}
      {acceptsFreeform ? (
        <QuestionInput aria-label="Answer" placeholder="Type your answer…" />
      ) : null}
      {inputResponse ? (
        <QuestionDescription>
          Responded:{" "}
          {selectedOption?.label ??
            inputResponse.text ??
            inputResponse.optionId}
        </QuestionDescription>
      ) : (
        <QuestionActions>
          <QuestionSubmit>Answer</QuestionSubmit>
        </QuestionActions>
      )}
    </Question>
  );
}

export function InputRequestActions({
  title,
  canRespond,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: RespondToAgentInput;
  readonly part: EveDynamicToolPart;
  readonly title?: string;
}) {
  const inputRequest = part.toolMetadata?.eve?.inputRequest;
  if (!inputRequest) return null;

  const inputResponse = part.toolMetadata.eve.inputResponse;
  const selectedOption = inputRequest.options?.find(
    (option) => option.id === inputResponse?.optionId
  );
  const approvalSummary = browserCommitApprovalSummary(part);

  return (
    <Alert variant="warning">
      <AlertTitle>{title ?? inputRequest.prompt}</AlertTitle>
      <AlertDescription>
        {approvalSummary ? (
          <p className="wrap-break-word whitespace-pre-wrap">
            {approvalSummary}
          </p>
        ) : null}
        {inputResponse ? (
          <p>
            Responded:{" "}
            {selectedOption?.label ??
              inputResponse.text ??
              inputResponse.optionId}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {inputRequest.options?.map((option) => (
              <Button
                disabled={!canRespond}
                key={option.id}
                onClick={() => {
                  void onInputResponses([
                    {
                      optionId: option.id,
                      requestId: inputRequest.requestId,
                    },
                  ]);
                }}
                size="sm"
                type="button"
                variant={option.style === "danger" ? "destructive" : "default"}
              >
                {option.label}
              </Button>
            ))}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

function browserCommitApprovalSummary(
  part: EveDynamicToolPart
): string | undefined {
  if (part.toolName !== "commit_browser_action") return undefined;
  const parsed = browserCommitApprovalProjection.safeParse(part.input);
  if (!parsed.success) return undefined;
  const { origin: pageOrigin, payment, terms } = parsed.data;

  switch (terms.kind) {
    case "place_order": {
      const paymentOrigin = payment?.origin;
      const paymentDisclosure =
        paymentOrigin && paymentOrigin !== pageOrigin
          ? ` Payment form: ${paymentOrigin}.`
          : "";
      return `Purchase ${String(terms.quantity)} × ${terms.item} (${terms.option}) from ${terms.merchant} for ${terms.total}.${paymentDisclosure}`;
    }
    case "send_message": {
      return `Send to ${terms.recipient}: ${terms.content}`;
    }
    case "delete": {
      return `Delete ${terms.target}. Impact: ${terms.impact}`;
    }
    case "submit": {
      return `Submit: ${terms.description}`;
    }
    default:
      return undefined;
  }
}

const approvalText = z.string().trim().min(1);
const browserCommitApprovalProjection = z.object({
  origin: z.url(),
  payment: z.object({ origin: z.url() }).optional(),
  terms: z.discriminatedUnion("kind", [
    z.object({
      item: approvalText,
      kind: z.literal("place_order"),
      merchant: approvalText,
      option: approvalText,
      quantity: z.number().int().positive(),
      total: approvalText,
    }),
    z.object({
      content: approvalText,
      kind: z.literal("send_message"),
      recipient: approvalText,
    }),
    z.object({
      impact: approvalText,
      kind: z.literal("delete"),
      target: approvalText,
    }),
    z.object({ description: approvalText, kind: z.literal("submit") }),
  ]),
});
