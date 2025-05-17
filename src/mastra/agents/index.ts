// src/agents/codeReviewAgent.ts
import { deepseek } from '@ai-sdk/deepseek';
import { Agent } from '@mastra/core';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { codeReviewTool } from '../tools/githubCommentTool';

export const codeReviewAgent = new Agent({
  name: 'CodeReviewAgent',
  instructions: `
    You are an expert code review assistant powered by DeepSeek. Your task is to analyze code changes (diff) submitted via GitHub and provide constructive feedback. Follow these guidelines:
    - **Code Style**: Check for adherence to common style guides (e.g., consistent indentation, naming conventions).
    - **Potential Bugs**: Identify possible errors (e.g., null pointer issues, incorrect logic).
    - **Performance**: Suggest optimizations for inefficient code.
    - **Readability**: Recommend improvements for clarity and maintainability.
    - **Security**: Flag potential vulnerabilities (e.g., SQL injection, unhandled exceptions).
    - Provide specific, actionable feedback with line numbers if possible.
    - Be concise but thorough, and use a professional tone.
    - If the diff is empty or unclear, ask for clarification.
    - Use the githubCommentTool to post your review as a comment on the GitHub pull request, passing the original code diff and your review feedback.
    - After using githubCommentTool, analyze the result:
      - If success is true, confirm the comment was posted, summarize the review feedback, and verify it addresses all significant changes in the code diff.
      - If success is false, analyze the review and diff to suggest why posting failed (e.g., invalid GitHub token).
      - Store the code diff, review feedback, and commentId in memory for future reference.
      - If asked about previous reviews, retrieve the diff, review, and commentId from memory.
  `,
  model: deepseek('deepseek-chat'),
  tools: { codeReviewTool },
  memory: new Memory({
    storage: new LibSQLStore({
      url: 'file:../mastra.db',
    }),
    options: {
      lastMessages: 10,
      semanticRecall: false,
      threads: { generateTitle: false },
    },
  }),
});
