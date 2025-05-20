다음은 위 내용을 한국어로 자연스럽게 전체 번역한 것입니다:

---

# MCP 클라이언트 챗봇

[![Local First](https://img.shields.io/badge/Local-First-blueviolet)](#)
[![MCP Supported](https://img.shields.io/badge/MCP-Supported-00c853)](https://modelcontextprotocol.io/introduction)
[![Discord](https://img.shields.io/discord/gCRu69Upnp?label=Discord&logo=discord&color=5865F2)](https://discord.gg/gCRu69Upnp)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/cgoinglove/mcp-client-chatbot&env=GOOGLE_GENERATIVE_AI_API_KEY&env=OPENAI_API_KEY&env=XAI_API_KEY&env=ANTHROPIC_API_KEY&env=POSTGRES_URL&env=AUTH_SECRET)

**MCP Client Chatbot**은 [OpenAI](https://openai.com/), [Anthropic](https://www.anthropic.com/), [Google](https://ai.google.dev/), [Ollama](https://ollama.com/) 등 다양한 AI 모델 공급자를 지원하는 다재다능한 챗 인터페이스입니다.
**복잡한 설정 없이 100% 로컬 환경에서 즉시 실행 가능하도록 설계**되어, 사용자가 개인 컴퓨터 또는 서버에서 컴퓨팅 리소스를 완전히 제어할 수 있도록 해줍니다.

> 이 앱은 [Vercel AI SDK](https://sdk.vercel.ai)와 [Next.js](https://nextjs.org/)로 제작되었으며, 현대적인 AI 챗 인터페이스 구축 패턴을 따릅니다.
> [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction)의 힘을 활용해 외부 도구들을 챗 경험에 원활하게 통합하세요.

**🌟 오픈 소스 프로젝트**
MCP 클라이언트 챗봇은 100% 커뮤니티 주도의 오픈소스 프로젝트입니다.

## 목차

- [MCP 클라이언트 챗봇](#mcp-클라이언트-챗봇)

  - [목차](#목차)
  - [데모](#데모)

    - [🧩 Playwright MCP로 브라우저 자동화](#-playwright-mcp로-브라우저-자동화)
    - [⚡️ 퀵 툴 호출 (`@`)](#️-퀵-툴-호출-)
    - [🔌 MCP 서버 간편 연결](#-mcp-서버-간편-연결)
    - [🛠️ 독립적인 도구 테스트](#️-독립적인-도구-테스트)
    - [📊 내장 차트 도구](#-내장-차트-도구)

  - [✨ 주요 기능](#-주요-기능)

    - [환경 변수](#환경-변수)
    - [MCP 서버 설정](#mcp-서버-설정)

  - [💡 팁 & 가이드](#-팁--가이드)
  - [🗺️ 로드맵: 향후 기능](#️-로드맵-향후-기능)

    - [🚀 배포 & 호스팅 ✅](#-배포--호스팅-)
    - [🗣️ 오디오 & 실시간 챗](#️-오디오--실시간-챗)
    - [📎 파일 & 이미지](#-파일--이미지)
    - [🔄 MCP 워크플로우](#-mcp-워크플로우)
    - [🛠️ 내장 도구 & UX](#️-내장-도구--ux)
    - [💻 LLM 코드 작성 (Daytona)](#-llm-코드-작성-daytona)

  - [🙌 기여하기](#-기여하기)
  - [💬 디스코드 참여](#-디스코드-참여)

---

## 데모

MCP 클라이언트 챗봇을 사용하는 몇 가지 예시입니다:

---

### 🧩 Playwright MCP로 브라우저 자동화

![playwright-demo](./images/preview-1.gif)

**예시:** Microsoft의 [playwright-mcp](https://github.com/microsoft/playwright-mcp) 도구로 브라우저 제어

샘플 프롬프트:

```prompt
GitHub에 접속해 cgoinglove 프로필로 이동하세요.
그 후 mcp-client-chatbot 프로젝트를 여세요.
README.md 파일을 클릭하세요.
브라우저를 닫으세요.
그리고 패키지 설치 방법을 알려주세요.
```

---

### ⚡️ 퀵 툴 호출 (`@`)

![mention](https://github.com/user-attachments/assets/1a80dd48-1d95-4938-b0d8-431c02ec2a53)

채팅 도중 `@도구명`만 입력하면 MCP 도구를 즉시 호출할 수 있습니다.
기억할 필요 없이 `@`만 입력하면 목록에서 선택 가능!

툴 사용 방식을 제어할 수 있는 **Tool Choice Mode**도 제공됩니다:

- **Auto:** 모델이 필요할 때 자동으로 도구 호출
- **Manual:** 도구 호출 전에 사용자에게 허락 요청
- **None:** 도구 호출 비활성화

`⌘P` 단축키로 언제든지 모드 변경 가능!

---

### 🔌 MCP 서버 간편 연결

![mcp-server-install](https://github.com/user-attachments/assets/c71fd58d-b16e-4517-85b3-160685a88e38)

UI에서 간편하게 MCP 서버를 추가하고, 앱을 재시작하지 않고도 도구 사용을 시작할 수 있습니다.

---

### 🛠️ 독립적인 도구 테스트

![tool-test](https://github.com/user-attachments/assets/980dd645-333f-4e5c-8ac9-3dc59db19e14)

채팅과 별도로 MCP 도구를 독립적으로 실행하고 디버깅할 수 있습니다.

### 📊 내장 차트 도구

![May-04-2025 01-55-04](https://github.com/user-attachments/assets/7bf9d895-9023-44b1-b7f2-426ae4d7d643)

파이, 막대, 선형 차트를 자연어로 생성하여 대화 중 데이터를 시각적으로 확인할 수 있습니다.

---

## ✨ 주요 기능

- **💻 100% 로컬 실행:** 복잡한 배포 없이 내 PC 또는 서버에서 직접 실행
- **🤖 다양한 AI 모델 지원:** OpenAI, Anthropic, Google AI, Ollama 등 유연하게 전환 가능
- **🛠️ 강력한 MCP 통합:** 브라우저 자동화, DB 작업 등 다양한 도구를 채팅에 통합
- **🚀 독립 도구 테스트:** 챗과 분리된 MCP 도구 개발/디버깅 환경
- **💬 직관적 `@` 호출 + 도구 제어:** 툴 사용 방식을 `Auto`, `Manual`, `None`으로 설정 가능
- **⚙️ 간단한 MCP 서버 설정:** UI 또는 `.mcp-config.json` 파일로 설정 가능
- **📄 마크다운 UI:** 깔끔하고 읽기 쉬운 채팅 인터페이스
- **🧩 커스텀 MCP 서버:** 내장 MCP 서버를 수정하거나 직접 구축 가능
- **📊 내장 차트 도구:** 자연어로 파이, 막대, 선 차트 생성
- **🛫 간편한 배포:** Vercel 배포 지원
- **🏃 어디서나 실행:** Docker 지원을 통해 이미지 빌드 후 바로 실행 가능

이 프로젝트는 [pnpm](https://pnpm.io/)을 권장 패키지 매니저로 사용합니다:

```bash
# 1. 의존성 설치
pnpm i

# 2. 환경 변수 파일 생성 및 값 입력
pnpm copy:env # 이 명령어는 postinstall 시 자동 실행되므로 생략 가능

# PostgreSQL이 실행 중이 아니라면: pnpm docker:pg
# 3. 데이터베이스 마이그레이션
pnpm db:migrate

# 4. 개발 서버 실행
pnpm dev

# 4. (선택) 로컬 테스트용 빌드 및 실행
pnpm build:local && pnpm start
# 로컬 실행 시에는 쿠키 설정이 정확히 되도록 build:local 을 사용하세요
```

[http://localhost:3000](http://localhost:3000)에서 브라우저로 시작하세요.

---

### 환경 변수

`pnpm i`를 실행하면 `.env` 파일이 생성됩니다. 해당 파일에 아래 API 키를 입력하세요:

```dotenv
GOOGLE_GENERATIVE_AI_API_KEY=****
OPENAI_API_KEY=****
ANTHROPIC_API_KEY=****
AUTH_SECRET=
POSTGRES_URL=
```

`AUTH_SECRET`은 `pnpx auth secret` 명령어로 생성하세요.

---

### MCP 서버 설정

MCP 도구를 연결하는 방법:

1. **UI 설정:** [http://localhost:3000/mcp](http://localhost:3000/mcp) 에서 인터페이스를 통해 설정
2. **커스텀 로직:** `./custom-mcp-server/index.ts` 파일을 수정해 직접 로직 구현 (Vercel 및 Docker에선 실행되지 않음)

---

## 💡 팁 & 가이드

MCP 클라이언트 챗봇을 잘 사용하는 방법:

- [MCP 서버와 프로젝트 통합](./tips-guides/project_with_mcp.md): GitHub 기반 프로젝트 관리 에이전트를 만드는 방법
- [Docker 배포 가이드](./tips-guides/docker.md): Docker 설정 방법
- [Vercel 배포 가이드](./tips-guides/vercel.md): Vercel 설정 방법

---

## 🗺️ 로드맵: 향후 기능

향후 MCP 클라이언트 챗봇은 아래 기능들을 포함할 예정입니다:

### 🚀 배포 & 호스팅 ✅

- **셀프 호스팅:** ✅

  - Docker Compose로 손쉬운 배포 ✅
  - Vercel 배포 지원 (MCP 서버는 SSE만 지원) ✅

### 🗣️ 오디오 & 실시간 챗

- **오디오 실시간 채팅**

  - MCP 서버와 연동된 음성 기반 실시간 대화

### 📎 파일 & 이미지

- **파일 첨부 및 이미지 생성**

  - 파일 업로드, 이미지 생성, 멀티모달 대화 지원

### 🔄 MCP 워크플로우

- **MCP 플로우**

  - MCP 서버와 연동된 자동화 워크플로우

### 🛠️ 내장 도구 & UX

- **챗봇용 기본 도구**

  - 공동 문서 편집 (OpenAI Canvas 스타일)
  - RAG (검색 기반 생성)
  - MCP 없이도 사용 가능한 유용한 내장 도구

### 💻 LLM 코드 작성 (Daytona)

- **Daytona 연동으로 LLM 기반 코드 작성/편집/실행**

  - 클라우드 개발환경에서 즉시 코드 생성, 수정, 실행 가능

💡 기능 제안이나 요청은 [이슈 등록](https://github.com/cgoinglove/mcp-client-chatbot/issues)을 통해 알려주세요!

---

## 🙌 기여하기

모든 기여를 환영합니다! 버그 리포트, 기능 제안, 코드 개선 등 여러분의 도움이 최고의 로컬 AI 비서를 만드는 데 큰 힘이 됩니다.

함께 만들어가요 🚀

## 💬 디스코드 참여

[![디스코드](https://img.shields.io/discord/gCRu69Upnp?label=Discord&logo=discord&color=5865F2)](https://discord.gg/gCRu69Upnp)

커뮤니티와 소통하고 질문하거나 공식 디스코드 서버에서 지원을 받아보세요!

---

요약도 필요하신가요?
