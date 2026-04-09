export interface ProjectTemplate {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  context: string;
  suggestedSkills: string[];
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "web-dev",
    name: "Web Development",
    icon: "🌐",
    color: "#3b82f6",
    description: "Full-stack web app development with modern frameworks",
    context: "Full-stack web development project. Tech stack includes modern JavaScript/TypeScript frameworks (React, Next.js, Vue, etc.), REST/GraphQL APIs, and cloud deployment. Follow best practices for performance, accessibility, and SEO.",
    suggestedSkills: ["code-review", "frontend-design", "deployment", "testing", "api-design"],
  },
  {
    id: "mobile",
    name: "Mobile App",
    icon: "📱",
    color: "#8b5cf6",
    description: "iOS/Android app development",
    context: "Mobile application development project. Covers native (Swift/Kotlin) or cross-platform (React Native, Flutter) development. Focus on performance, offline-first, and platform-specific UX patterns.",
    suggestedSkills: ["mobile-ui", "app-store", "push-notifications", "offline-sync"],
  },
  {
    id: "data-science",
    name: "Data Science",
    icon: "📊",
    color: "#10b981",
    description: "Data analysis, ML models, and pipelines",
    context: "Data science and machine learning project. Uses Python (pandas, scikit-learn, PyTorch/TensorFlow), Jupyter notebooks, data pipelines. Focus on reproducibility, experiment tracking, and model validation.",
    suggestedSkills: ["data-analysis", "model-training", "jupyter", "data-validation", "visualization"],
  },
  {
    id: "devops",
    name: "DevOps & Infrastructure",
    icon: "⚙️",
    color: "#f59e0b",
    description: "CI/CD, cloud infrastructure, monitoring",
    context: "DevOps and infrastructure project. Covers CI/CD pipelines, container orchestration (Docker, Kubernetes), cloud providers (AWS/GCP/Azure), monitoring, and infrastructure as code (Terraform, Pulumi).",
    suggestedSkills: ["deployment", "monitoring", "docker", "terraform", "security-audit"],
  },
  {
    id: "api",
    name: "API Development",
    icon: "🔌",
    color: "#ef4444",
    description: "REST/GraphQL API design and development",
    context: "API development project. Focus on clean API design (REST or GraphQL), proper error handling, authentication/authorization, rate limiting, versioning, and comprehensive documentation.",
    suggestedSkills: ["api-design", "authentication", "documentation", "testing", "rate-limiting"],
  },
  {
    id: "saas",
    name: "SaaS Product",
    icon: "🚀",
    color: "#ec4899",
    description: "SaaS application with auth, billing, and multi-tenancy",
    context: "SaaS product development. Includes user authentication, subscription billing (Stripe), multi-tenancy, admin dashboard, usage analytics, and email notifications. Focus on scalability and security.",
    suggestedSkills: ["authentication", "billing", "multi-tenancy", "admin-dashboard", "analytics"],
  },
];
