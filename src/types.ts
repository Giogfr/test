export interface UserProfile {
  uid: string;
  username: string;
  email: string;
  displayName: string;
  photoURL: string;
  completedCount: number;
  lastActive: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userPhotoURL: string;
  text: string;
  createdAt: string;
  replyTo?: {
    id: string;
    userName: string;
    text: string;
  };
  mentions?: string[];
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  userPhotoURL: string;
  text: string;
  createdAt: string;
}

export interface Task {
  id: string;
  userId: string;
  userName: string;
  title: string;
  description?: string;
  dueDate?: string;
  priority?: 'none' | 'idea' | 'low' | 'medium' | 'high';
  tags?: string[];
  completed: boolean;
  completedBy?: string;
  completedByName?: string;
  comments?: Comment[];
  createdAt: string;
  updatedAt: string;
}
