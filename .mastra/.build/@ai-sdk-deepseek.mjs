import { c as createJsonErrorResponseHandler, p as postJsonToApi, a as combineHeaders, g as generateId, I as InvalidResponseDataError, i as isParsableJson, U as UnsupportedFunctionalityError, b as convertUint8ArrayToBase64, d as createJsonResponseHandler, e as createEventSourceResponseHandler, w as withoutTrailingSlash, N as NoSuchModelError, l as loadApiKey, s as safeValidateTypes } from './index2.mjs';
import { l as lib } from './_virtual__virtual-zod.mjs';

// src/openai-compatible-chat-language-model.ts
function getOpenAIMetadata(message) {
  var _a, _b;
  return (_b = (_a = message == null ? void 0 : message.providerMetadata) == null ? void 0 : _a.openaiCompatible) != null ? _b : {};
}
function convertToOpenAICompatibleChatMessages(prompt) {
  const messages = [];
  for (const { role, content, ...message } of prompt) {
    const metadata = getOpenAIMetadata({ ...message });
    switch (role) {
      case "system": {
        messages.push({ role: "system", content, ...metadata });
        break;
      }
      case "user": {
        if (content.length === 1 && content[0].type === "text") {
          messages.push({
            role: "user",
            content: content[0].text,
            ...getOpenAIMetadata(content[0])
          });
          break;
        }
        messages.push({
          role: "user",
          content: content.map((part) => {
            var _a;
            const partMetadata = getOpenAIMetadata(part);
            switch (part.type) {
              case "text": {
                return { type: "text", text: part.text, ...partMetadata };
              }
              case "image": {
                return {
                  type: "image_url",
                  image_url: {
                    url: part.image instanceof URL ? part.image.toString() : `data:${(_a = part.mimeType) != null ? _a : "image/jpeg"};base64,${convertUint8ArrayToBase64(part.image)}`
                  },
                  ...partMetadata
                };
              }
              case "file": {
                throw new UnsupportedFunctionalityError({
                  functionality: "File content parts in user messages"
                });
              }
            }
          }),
          ...metadata
        });
        break;
      }
      case "assistant": {
        let text = "";
        const toolCalls = [];
        for (const part of content) {
          const partMetadata = getOpenAIMetadata(part);
          switch (part.type) {
            case "text": {
              text += part.text;
              break;
            }
            case "tool-call": {
              toolCalls.push({
                id: part.toolCallId,
                type: "function",
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.args)
                },
                ...partMetadata
              });
              break;
            }
          }
        }
        messages.push({
          role: "assistant",
          content: text,
          tool_calls: toolCalls.length > 0 ? toolCalls : void 0,
          ...metadata
        });
        break;
      }
      case "tool": {
        for (const toolResponse of content) {
          const toolResponseMetadata = getOpenAIMetadata(toolResponse);
          messages.push({
            role: "tool",
            tool_call_id: toolResponse.toolCallId,
            content: JSON.stringify(toolResponse.result),
            ...toolResponseMetadata
          });
        }
        break;
      }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  return messages;
}

// src/get-response-metadata.ts
function getResponseMetadata({
  id,
  model,
  created
}) {
  return {
    id: id != null ? id : void 0,
    modelId: model != null ? model : void 0,
    timestamp: created != null ? new Date(created * 1e3) : void 0
  };
}

// src/map-openai-compatible-finish-reason.ts
function mapOpenAICompatibleFinishReason(finishReason) {
  switch (finishReason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "content_filter":
      return "content-filter";
    case "function_call":
    case "tool_calls":
      return "tool-calls";
    default:
      return "unknown";
  }
}
var openaiCompatibleErrorDataSchema = lib.z.object({
  error: lib.z.object({
    message: lib.z.string(),
    // The additional information below is handled loosely to support
    // OpenAI-compatible providers that have slightly different error
    // responses:
    type: lib.z.string().nullish(),
    param: lib.z.any().nullish(),
    code: lib.z.union([lib.z.string(), lib.z.number()]).nullish()
  })
});
var defaultOpenAICompatibleErrorStructure = {
  errorSchema: openaiCompatibleErrorDataSchema,
  errorToMessage: (data) => data.error.message
};
function prepareTools({
  mode,
  structuredOutputs
}) {
  var _a;
  const tools = ((_a = mode.tools) == null ? void 0 : _a.length) ? mode.tools : void 0;
  const toolWarnings = [];
  if (tools == null) {
    return { tools: void 0, tool_choice: void 0, toolWarnings };
  }
  const toolChoice = mode.toolChoice;
  const openaiCompatTools = [];
  for (const tool of tools) {
    if (tool.type === "provider-defined") {
      toolWarnings.push({ type: "unsupported-tool", tool });
    } else {
      openaiCompatTools.push({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      });
    }
  }
  if (toolChoice == null) {
    return { tools: openaiCompatTools, tool_choice: void 0, toolWarnings };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
    case "none":
    case "required":
      return { tools: openaiCompatTools, tool_choice: type, toolWarnings };
    case "tool":
      return {
        tools: openaiCompatTools,
        tool_choice: {
          type: "function",
          function: {
            name: toolChoice.toolName
          }
        },
        toolWarnings
      };
    default: {
      const _exhaustiveCheck = type;
      throw new UnsupportedFunctionalityError({
        functionality: `Unsupported tool choice type: ${_exhaustiveCheck}`
      });
    }
  }
}

// src/openai-compatible-chat-language-model.ts
var OpenAICompatibleChatLanguageModel = class {
  // type inferred via constructor
  constructor(modelId, settings, config) {
    this.specificationVersion = "v1";
    var _a, _b;
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
    const errorStructure = (_a = config.errorStructure) != null ? _a : defaultOpenAICompatibleErrorStructure;
    this.chunkSchema = createOpenAICompatibleChatChunkSchema(
      errorStructure.errorSchema
    );
    this.failedResponseHandler = createJsonErrorResponseHandler(errorStructure);
    this.supportsStructuredOutputs = (_b = config.supportsStructuredOutputs) != null ? _b : false;
  }
  get defaultObjectGenerationMode() {
    return this.config.defaultObjectGenerationMode;
  }
  get provider() {
    return this.config.provider;
  }
  get providerOptionsName() {
    return this.config.provider.split(".")[0].trim();
  }
  getArgs({
    mode,
    prompt,
    maxTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    providerMetadata,
    stopSequences,
    responseFormat,
    seed
  }) {
    var _a, _b, _c, _d, _e;
    const type = mode.type;
    const warnings = [];
    if (topK != null) {
      warnings.push({
        type: "unsupported-setting",
        setting: "topK"
      });
    }
    if ((responseFormat == null ? void 0 : responseFormat.type) === "json" && responseFormat.schema != null && !this.supportsStructuredOutputs) {
      warnings.push({
        type: "unsupported-setting",
        setting: "responseFormat",
        details: "JSON response format schema is only supported with structuredOutputs"
      });
    }
    const baseArgs = {
      // model id:
      model: this.modelId,
      // model specific settings:
      user: this.settings.user,
      // standardized settings:
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      response_format: (responseFormat == null ? void 0 : responseFormat.type) === "json" ? this.supportsStructuredOutputs === true && responseFormat.schema != null ? {
        type: "json_schema",
        json_schema: {
          schema: responseFormat.schema,
          name: (_a = responseFormat.name) != null ? _a : "response",
          description: responseFormat.description
        }
      } : { type: "json_object" } : void 0,
      stop: stopSequences,
      seed,
      ...providerMetadata == null ? void 0 : providerMetadata[this.providerOptionsName],
      reasoning_effort: (_d = (_b = providerMetadata == null ? void 0 : providerMetadata[this.providerOptionsName]) == null ? void 0 : _b.reasoningEffort) != null ? _d : (_c = providerMetadata == null ? void 0 : providerMetadata["openai-compatible"]) == null ? void 0 : _c.reasoningEffort,
      // messages:
      messages: convertToOpenAICompatibleChatMessages(prompt)
    };
    switch (type) {
      case "regular": {
        const { tools, tool_choice, toolWarnings } = prepareTools({
          mode,
          structuredOutputs: this.supportsStructuredOutputs
        });
        return {
          args: { ...baseArgs, tools, tool_choice },
          warnings: [...warnings, ...toolWarnings]
        };
      }
      case "object-json": {
        return {
          args: {
            ...baseArgs,
            response_format: this.supportsStructuredOutputs === true && mode.schema != null ? {
              type: "json_schema",
              json_schema: {
                schema: mode.schema,
                name: (_e = mode.name) != null ? _e : "response",
                description: mode.description
              }
            } : { type: "json_object" }
          },
          warnings
        };
      }
      case "object-tool": {
        return {
          args: {
            ...baseArgs,
            tool_choice: {
              type: "function",
              function: { name: mode.tool.name }
            },
            tools: [
              {
                type: "function",
                function: {
                  name: mode.tool.name,
                  description: mode.tool.description,
                  parameters: mode.tool.parameters
                }
              }
            ]
          },
          warnings
        };
      }
      default: {
        const _exhaustiveCheck = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }
  async doGenerate(options) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    const { args, warnings } = this.getArgs({ ...options });
    const body = JSON.stringify(args);
    const {
      responseHeaders,
      value: responseBody,
      rawValue: rawResponse
    } = await postJsonToApi({
      url: this.config.url({
        path: "/chat/completions",
        modelId: this.modelId
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        OpenAICompatibleChatResponseSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const { messages: rawPrompt, ...rawSettings } = args;
    const choice = responseBody.choices[0];
    const providerMetadata = {
      [this.providerOptionsName]: {},
      ...(_b = (_a = this.config.metadataExtractor) == null ? void 0 : _a.extractMetadata) == null ? void 0 : _b.call(_a, {
        parsedBody: rawResponse
      })
    };
    const completionTokenDetails = (_c = responseBody.usage) == null ? void 0 : _c.completion_tokens_details;
    const promptTokenDetails = (_d = responseBody.usage) == null ? void 0 : _d.prompt_tokens_details;
    if ((completionTokenDetails == null ? void 0 : completionTokenDetails.reasoning_tokens) != null) {
      providerMetadata[this.providerOptionsName].reasoningTokens = completionTokenDetails == null ? void 0 : completionTokenDetails.reasoning_tokens;
    }
    if ((completionTokenDetails == null ? void 0 : completionTokenDetails.accepted_prediction_tokens) != null) {
      providerMetadata[this.providerOptionsName].acceptedPredictionTokens = completionTokenDetails == null ? void 0 : completionTokenDetails.accepted_prediction_tokens;
    }
    if ((completionTokenDetails == null ? void 0 : completionTokenDetails.rejected_prediction_tokens) != null) {
      providerMetadata[this.providerOptionsName].rejectedPredictionTokens = completionTokenDetails == null ? void 0 : completionTokenDetails.rejected_prediction_tokens;
    }
    if ((promptTokenDetails == null ? void 0 : promptTokenDetails.cached_tokens) != null) {
      providerMetadata[this.providerOptionsName].cachedPromptTokens = promptTokenDetails == null ? void 0 : promptTokenDetails.cached_tokens;
    }
    return {
      text: (_e = choice.message.content) != null ? _e : void 0,
      reasoning: (_f = choice.message.reasoning_content) != null ? _f : void 0,
      toolCalls: (_g = choice.message.tool_calls) == null ? void 0 : _g.map((toolCall) => {
        var _a2;
        return {
          toolCallType: "function",
          toolCallId: (_a2 = toolCall.id) != null ? _a2 : generateId(),
          toolName: toolCall.function.name,
          args: toolCall.function.arguments
        };
      }),
      finishReason: mapOpenAICompatibleFinishReason(choice.finish_reason),
      usage: {
        promptTokens: (_i = (_h = responseBody.usage) == null ? void 0 : _h.prompt_tokens) != null ? _i : NaN,
        completionTokens: (_k = (_j = responseBody.usage) == null ? void 0 : _j.completion_tokens) != null ? _k : NaN
      },
      providerMetadata,
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders, body: rawResponse },
      response: getResponseMetadata(responseBody),
      warnings,
      request: { body }
    };
  }
  async doStream(options) {
    var _a;
    if (this.settings.simulateStreaming) {
      const result = await this.doGenerate(options);
      const simulatedStream = new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "response-metadata", ...result.response });
          if (result.reasoning) {
            if (Array.isArray(result.reasoning)) {
              for (const part of result.reasoning) {
                if (part.type === "text") {
                  controller.enqueue({
                    type: "reasoning",
                    textDelta: part.text
                  });
                }
              }
            } else {
              controller.enqueue({
                type: "reasoning",
                textDelta: result.reasoning
              });
            }
          }
          if (result.text) {
            controller.enqueue({
              type: "text-delta",
              textDelta: result.text
            });
          }
          if (result.toolCalls) {
            for (const toolCall of result.toolCalls) {
              controller.enqueue({
                type: "tool-call",
                ...toolCall
              });
            }
          }
          controller.enqueue({
            type: "finish",
            finishReason: result.finishReason,
            usage: result.usage,
            logprobs: result.logprobs,
            providerMetadata: result.providerMetadata
          });
          controller.close();
        }
      });
      return {
        stream: simulatedStream,
        rawCall: result.rawCall,
        rawResponse: result.rawResponse,
        warnings: result.warnings
      };
    }
    const { args, warnings } = this.getArgs({ ...options });
    const body = {
      ...args,
      stream: true,
      // only include stream_options when in strict compatibility mode:
      stream_options: this.config.includeUsage ? { include_usage: true } : void 0
    };
    const metadataExtractor = (_a = this.config.metadataExtractor) == null ? void 0 : _a.createStreamExtractor();
    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: "/chat/completions",
        modelId: this.modelId
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        this.chunkSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const { messages: rawPrompt, ...rawSettings } = args;
    const toolCalls = [];
    let finishReason = "unknown";
    let usage = {
      completionTokens: void 0,
      completionTokensDetails: {
        reasoningTokens: void 0,
        acceptedPredictionTokens: void 0,
        rejectedPredictionTokens: void 0
      },
      promptTokens: void 0,
      promptTokensDetails: {
        cachedTokens: void 0
      }
    };
    let isFirstChunk = true;
    let providerOptionsName = this.providerOptionsName;
    return {
      stream: response.pipeThrough(
        new TransformStream({
          // TODO we lost type safety on Chunk, most likely due to the error schema. MUST FIX
          transform(chunk, controller) {
            var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
            if (!chunk.success) {
              finishReason = "error";
              controller.enqueue({ type: "error", error: chunk.error });
              return;
            }
            const value = chunk.value;
            metadataExtractor == null ? void 0 : metadataExtractor.processChunk(chunk.rawValue);
            if ("error" in value) {
              finishReason = "error";
              controller.enqueue({ type: "error", error: value.error.message });
              return;
            }
            if (isFirstChunk) {
              isFirstChunk = false;
              controller.enqueue({
                type: "response-metadata",
                ...getResponseMetadata(value)
              });
            }
            if (value.usage != null) {
              const {
                prompt_tokens,
                completion_tokens,
                prompt_tokens_details,
                completion_tokens_details
              } = value.usage;
              usage.promptTokens = prompt_tokens != null ? prompt_tokens : void 0;
              usage.completionTokens = completion_tokens != null ? completion_tokens : void 0;
              if ((completion_tokens_details == null ? void 0 : completion_tokens_details.reasoning_tokens) != null) {
                usage.completionTokensDetails.reasoningTokens = completion_tokens_details == null ? void 0 : completion_tokens_details.reasoning_tokens;
              }
              if ((completion_tokens_details == null ? void 0 : completion_tokens_details.accepted_prediction_tokens) != null) {
                usage.completionTokensDetails.acceptedPredictionTokens = completion_tokens_details == null ? void 0 : completion_tokens_details.accepted_prediction_tokens;
              }
              if ((completion_tokens_details == null ? void 0 : completion_tokens_details.rejected_prediction_tokens) != null) {
                usage.completionTokensDetails.rejectedPredictionTokens = completion_tokens_details == null ? void 0 : completion_tokens_details.rejected_prediction_tokens;
              }
              if ((prompt_tokens_details == null ? void 0 : prompt_tokens_details.cached_tokens) != null) {
                usage.promptTokensDetails.cachedTokens = prompt_tokens_details == null ? void 0 : prompt_tokens_details.cached_tokens;
              }
            }
            const choice = value.choices[0];
            if ((choice == null ? void 0 : choice.finish_reason) != null) {
              finishReason = mapOpenAICompatibleFinishReason(
                choice.finish_reason
              );
            }
            if ((choice == null ? void 0 : choice.delta) == null) {
              return;
            }
            const delta = choice.delta;
            if (delta.reasoning_content != null) {
              controller.enqueue({
                type: "reasoning",
                textDelta: delta.reasoning_content
              });
            }
            if (delta.content != null) {
              controller.enqueue({
                type: "text-delta",
                textDelta: delta.content
              });
            }
            if (delta.tool_calls != null) {
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index;
                if (toolCalls[index] == null) {
                  if (toolCallDelta.type !== "function") {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function' type.`
                    });
                  }
                  if (toolCallDelta.id == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'id' to be a string.`
                    });
                  }
                  if (((_a2 = toolCallDelta.function) == null ? void 0 : _a2.name) == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function.name' to be a string.`
                    });
                  }
                  toolCalls[index] = {
                    id: toolCallDelta.id,
                    type: "function",
                    function: {
                      name: toolCallDelta.function.name,
                      arguments: (_b = toolCallDelta.function.arguments) != null ? _b : ""
                    },
                    hasFinished: false
                  };
                  const toolCall2 = toolCalls[index];
                  if (((_c = toolCall2.function) == null ? void 0 : _c.name) != null && ((_d = toolCall2.function) == null ? void 0 : _d.arguments) != null) {
                    if (toolCall2.function.arguments.length > 0) {
                      controller.enqueue({
                        type: "tool-call-delta",
                        toolCallType: "function",
                        toolCallId: toolCall2.id,
                        toolName: toolCall2.function.name,
                        argsTextDelta: toolCall2.function.arguments
                      });
                    }
                    if (isParsableJson(toolCall2.function.arguments)) {
                      controller.enqueue({
                        type: "tool-call",
                        toolCallType: "function",
                        toolCallId: (_e = toolCall2.id) != null ? _e : generateId(),
                        toolName: toolCall2.function.name,
                        args: toolCall2.function.arguments
                      });
                      toolCall2.hasFinished = true;
                    }
                  }
                  continue;
                }
                const toolCall = toolCalls[index];
                if (toolCall.hasFinished) {
                  continue;
                }
                if (((_f = toolCallDelta.function) == null ? void 0 : _f.arguments) != null) {
                  toolCall.function.arguments += (_h = (_g = toolCallDelta.function) == null ? void 0 : _g.arguments) != null ? _h : "";
                }
                controller.enqueue({
                  type: "tool-call-delta",
                  toolCallType: "function",
                  toolCallId: toolCall.id,
                  toolName: toolCall.function.name,
                  argsTextDelta: (_i = toolCallDelta.function.arguments) != null ? _i : ""
                });
                if (((_j = toolCall.function) == null ? void 0 : _j.name) != null && ((_k = toolCall.function) == null ? void 0 : _k.arguments) != null && isParsableJson(toolCall.function.arguments)) {
                  controller.enqueue({
                    type: "tool-call",
                    toolCallType: "function",
                    toolCallId: (_l = toolCall.id) != null ? _l : generateId(),
                    toolName: toolCall.function.name,
                    args: toolCall.function.arguments
                  });
                  toolCall.hasFinished = true;
                }
              }
            }
          },
          flush(controller) {
            var _a2, _b;
            const providerMetadata = {
              [providerOptionsName]: {},
              ...metadataExtractor == null ? void 0 : metadataExtractor.buildMetadata()
            };
            if (usage.completionTokensDetails.reasoningTokens != null) {
              providerMetadata[providerOptionsName].reasoningTokens = usage.completionTokensDetails.reasoningTokens;
            }
            if (usage.completionTokensDetails.acceptedPredictionTokens != null) {
              providerMetadata[providerOptionsName].acceptedPredictionTokens = usage.completionTokensDetails.acceptedPredictionTokens;
            }
            if (usage.completionTokensDetails.rejectedPredictionTokens != null) {
              providerMetadata[providerOptionsName].rejectedPredictionTokens = usage.completionTokensDetails.rejectedPredictionTokens;
            }
            if (usage.promptTokensDetails.cachedTokens != null) {
              providerMetadata[providerOptionsName].cachedPromptTokens = usage.promptTokensDetails.cachedTokens;
            }
            controller.enqueue({
              type: "finish",
              finishReason,
              usage: {
                promptTokens: (_a2 = usage.promptTokens) != null ? _a2 : NaN,
                completionTokens: (_b = usage.completionTokens) != null ? _b : NaN
              },
              providerMetadata
            });
          }
        })
      ),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      warnings,
      request: { body: JSON.stringify(body) }
    };
  }
};
var openaiCompatibleTokenUsageSchema = lib.z.object({
  prompt_tokens: lib.z.number().nullish(),
  completion_tokens: lib.z.number().nullish(),
  prompt_tokens_details: lib.z.object({
    cached_tokens: lib.z.number().nullish()
  }).nullish(),
  completion_tokens_details: lib.z.object({
    reasoning_tokens: lib.z.number().nullish(),
    accepted_prediction_tokens: lib.z.number().nullish(),
    rejected_prediction_tokens: lib.z.number().nullish()
  }).nullish()
}).nullish();
var OpenAICompatibleChatResponseSchema = lib.z.object({
  id: lib.z.string().nullish(),
  created: lib.z.number().nullish(),
  model: lib.z.string().nullish(),
  choices: lib.z.array(
    lib.z.object({
      message: lib.z.object({
        role: lib.z.literal("assistant").nullish(),
        content: lib.z.string().nullish(),
        reasoning_content: lib.z.string().nullish(),
        tool_calls: lib.z.array(
          lib.z.object({
            id: lib.z.string().nullish(),
            type: lib.z.literal("function"),
            function: lib.z.object({
              name: lib.z.string(),
              arguments: lib.z.string()
            })
          })
        ).nullish()
      }),
      finish_reason: lib.z.string().nullish()
    })
  ),
  usage: openaiCompatibleTokenUsageSchema
});
var createOpenAICompatibleChatChunkSchema = (errorSchema) => lib.z.union([
  lib.z.object({
    id: lib.z.string().nullish(),
    created: lib.z.number().nullish(),
    model: lib.z.string().nullish(),
    choices: lib.z.array(
      lib.z.object({
        delta: lib.z.object({
          role: lib.z.enum(["assistant"]).nullish(),
          content: lib.z.string().nullish(),
          reasoning_content: lib.z.string().nullish(),
          tool_calls: lib.z.array(
            lib.z.object({
              index: lib.z.number(),
              id: lib.z.string().nullish(),
              type: lib.z.literal("function").nullish(),
              function: lib.z.object({
                name: lib.z.string().nullish(),
                arguments: lib.z.string().nullish()
              })
            })
          ).nullish()
        }).nullish(),
        finish_reason: lib.z.string().nullish()
      })
    ),
    usage: openaiCompatibleTokenUsageSchema
  }),
  errorSchema
]);
lib.z.object({
  id: lib.z.string().nullish(),
  created: lib.z.number().nullish(),
  model: lib.z.string().nullish(),
  choices: lib.z.array(
    lib.z.object({
      text: lib.z.string(),
      finish_reason: lib.z.string()
    })
  ),
  usage: lib.z.object({
    prompt_tokens: lib.z.number(),
    completion_tokens: lib.z.number()
  }).nullish()
});
lib.z.object({
  data: lib.z.array(lib.z.object({ embedding: lib.z.array(lib.z.number()) })),
  usage: lib.z.object({ prompt_tokens: lib.z.number() }).nullish()
});
lib.z.object({
  data: lib.z.array(lib.z.object({ b64_json: lib.z.string() }))
});

// src/deepseek-provider.ts
var buildDeepseekMetadata = (usage) => {
  var _a, _b;
  return usage == null ? void 0 : {
    deepseek: {
      promptCacheHitTokens: (_a = usage.prompt_cache_hit_tokens) != null ? _a : NaN,
      promptCacheMissTokens: (_b = usage.prompt_cache_miss_tokens) != null ? _b : NaN
    }
  };
};
var deepSeekMetadataExtractor = {
  extractMetadata: ({ parsedBody }) => {
    const parsed = safeValidateTypes({
      value: parsedBody,
      schema: deepSeekResponseSchema
    });
    return !parsed.success || parsed.value.usage == null ? void 0 : buildDeepseekMetadata(parsed.value.usage);
  },
  createStreamExtractor: () => {
    let usage;
    return {
      processChunk: (chunk) => {
        var _a, _b;
        const parsed = safeValidateTypes({
          value: chunk,
          schema: deepSeekStreamChunkSchema
        });
        if (parsed.success && ((_b = (_a = parsed.value.choices) == null ? void 0 : _a[0]) == null ? void 0 : _b.finish_reason) === "stop" && parsed.value.usage) {
          usage = parsed.value.usage;
        }
      },
      buildMetadata: () => buildDeepseekMetadata(usage)
    };
  }
};
var deepSeekUsageSchema = lib.z.object({
  prompt_cache_hit_tokens: lib.z.number().nullish(),
  prompt_cache_miss_tokens: lib.z.number().nullish()
});
var deepSeekResponseSchema = lib.z.object({
  usage: deepSeekUsageSchema.nullish()
});
var deepSeekStreamChunkSchema = lib.z.object({
  choices: lib.z.array(
    lib.z.object({
      finish_reason: lib.z.string().nullish()
    })
  ).nullish(),
  usage: deepSeekUsageSchema.nullish()
});

// src/deepseek-provider.ts
function createDeepSeek(options = {}) {
  var _a;
  const baseURL = withoutTrailingSlash(
    (_a = options.baseURL) != null ? _a : "https://api.deepseek.com/v1"
  );
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: "DEEPSEEK_API_KEY",
      description: "DeepSeek API key"
    })}`,
    ...options.headers
  });
  const createLanguageModel = (modelId, settings = {}) => {
    return new OpenAICompatibleChatLanguageModel(modelId, settings, {
      provider: `deepseek.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      defaultObjectGenerationMode: "json",
      metadataExtractor: deepSeekMetadataExtractor
    });
  };
  const provider = (modelId, settings) => createLanguageModel(modelId, settings);
  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;
  provider.textEmbeddingModel = (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: "textEmbeddingModel" });
  };
  return provider;
}
var deepseek = createDeepSeek();

export { deepseek };
