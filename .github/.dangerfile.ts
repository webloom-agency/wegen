// @ts-nocheck
import { danger, fail, warn } from "danger";

const prTitle = danger.github.pr.title;
const conventionalRegex =
  /^(feat|fix|chore|docs|style|refactor|test|perf|build)(\(.+\))?!?: .+/;

if (!conventionalRegex.test(prTitle))
  fail(
    `❌ The PR title does not follow the Conventional Commit format.
  
  Expected formats include:
  - feat: add login functionality
  - fix: correct redirect bug
  - chore: update dependency xyz
  
  Supported prefixes:
  - feat
  - fix
  - chore
  - docs
  - style
  - refactor
  - test
  - perf
  - build
  
  Please update your PR title to match one of these formats.`,
  );
