export const Keys = {
  User: {
    id(id: string): string {
      return `account:id:${id}`;
    },
    email(email: string): string {
      return `account:${email}`;
    },
  },
  Domain: {
    id(id: string): string {
      return `domain:id:${id}`;
    },
    project(projectId: string): string {
      return `domain:project:${projectId}`;
    },
  },
} as const;
