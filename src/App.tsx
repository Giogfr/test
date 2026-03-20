/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Task, UserProfile, ChatMessage } from './types';
import { 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Circle, 
  Layout, 
  Loader2, 
  AlertCircle,
  Search,
  Filter,
  User as UserIcon,
  LogOut,
  Calendar,
  Tag,
  BarChart3,
  CheckCircle,
  Clock,
  Edit2,
  X,
  Trophy,
  Users,
  Lock,
  ArrowRight,
  MessageSquare,
  Send,
  Share2,
  Check,
  Lightbulb
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, isPast, isToday, parseISO, formatDistanceToNow } from 'date-fns';
import confetti from 'canvas-confetti';
import { auth, db } from './firebase';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  updateProfile as firebaseUpdateProfile
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot,
  Timestamp,
  increment,
  writeBatch,
  getDocFromServer
} from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [view, setView] = useState<'board' | 'scoreboard' | 'profiles'>('board');
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  
  // Auth state
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPhotoURL, setNewPhotoURL] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isServerOnline, setIsServerOnline] = useState<boolean | null>(null);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'none' | 'idea' | 'low' | 'medium' | 'high'>('medium');
  const [newTaskTags, setNewTaskTags] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newComment, setNewComment] = useState('');
  const [showCopied, setShowCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [sortBy, setSortBy] = useState<'createdAt' | 'dueDate' | 'priority'>('createdAt');
  const [error, setError] = useState<string | null>(null);
  const [undoTask, setUndoTask] = useState<{ id: string, completed: boolean } | null>(null);
  const [activities, setActivities] = useState<Task[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [newChatMessage, setNewChatMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);

  const isAdmin = (user?.email?.toLowerCase() === 'idontsayidontsay@gmail.com') || (auth.currentUser?.email?.toLowerCase() === 'idontsayidontsay@gmail.com');
  console.log('Admin Check:', { 
    userEmail: user?.email, 
    authEmail: auth.currentUser?.email, 
    isAdmin 
  });

  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    setError(`Firestore Error: ${errInfo.error}`);
    throw new Error(JSON.stringify(errInfo));
  };

  // Auth & Health Check
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data() as UserProfile;
            setUser(userData);
            setNewDisplayName(userData.displayName);
            
            // Update last active
            await updateDoc(doc(db, 'users', firebaseUser.uid), {
              lastActive: new Date().toISOString()
            });
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    const checkHealth = async () => {
      try {
        await getDocFromServer(doc(db, 'health', 'check'));
        setIsServerOnline(true);
      } catch (err) {
        if (err instanceof Error && err.message.includes('the client is offline')) {
          setIsServerOnline(false);
        } else {
          setIsServerOnline(true); // Other errors mean we are online but doc doesn't exist
        }
      }
    };

    checkHealth();
    const healthInterval = setInterval(checkHealth, 30000);
    return () => {
      unsubscribeAuth();
      clearInterval(healthInterval);
    };
  }, []);

  // Real-time Data Listeners
  useEffect(() => {
    if (!user) return;

    const tasksQuery = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
    const unsubscribeTasks = onSnapshot(tasksQuery, (snapshot) => {
      const taskList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      setTasks(taskList);
      
      // Activities (last 10 updated)
      const sortedByUpdate = [...taskList].sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ).slice(0, 10);
      setActivities(sortedByUpdate);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'tasks'));

    const usersQuery = query(collection(db, 'users'), orderBy('completedCount', 'desc'));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const userList = snapshot.docs.map(doc => doc.data() as UserProfile);
      setUsers(userList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    const chatsQuery = query(collection(db, 'chats'), orderBy('createdAt', 'asc'), limit(100));
    const unsubscribeChats = onSnapshot(chatsQuery, (snapshot) => {
      const chatList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      setChatMessages(chatList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'chats'));

    return () => {
      unsubscribeTasks();
      unsubscribeUsers();
      unsubscribeChats();
    };
  }, [user]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    
    setAuthError(null);
    setIsSubmitting(true);
    
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();
    
    if (isRegistering) {
      if (!trimmedUsername || !trimmedEmail || password.length < 6) {
        setAuthError('Username, Email and a 6+ character password are required.');
        return;
      }
    } else {
      if (!trimmedUsername || password.length < 6) {
        setAuthError('Username or Email required and password must be at least 6 characters.');
        return;
      }
    }

    try {
      if (isRegistering) {
        // Check username uniqueness
        const usernameDoc = await getDoc(doc(db, 'usernames', trimmedUsername.toLowerCase()));
        if (usernameDoc.exists()) {
          setAuthError('Username already exists');
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        const firebaseUser = userCredential.user;

        const newUser: UserProfile = {
          uid: firebaseUser.uid,
          username: trimmedUsername.toLowerCase(),
          email: trimmedEmail,
          displayName: trimmedUsername,
          photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${trimmedUsername}`,
          completedCount: 0,
          createdAt: new Date().toISOString(),
          lastActive: new Date().toISOString()
        };

        await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
        await setDoc(doc(db, 'usernames', trimmedUsername.toLowerCase()), { uid: firebaseUser.uid });
        setUser(newUser);
        setNewDisplayName(newUser.displayName);
      } else {
        // For login, if it's not an email, we assume it's a username and try to find the email
        let loginEmail = trimmedUsername;
        if (!trimmedUsername.includes('@')) {
          const usernameDoc = await getDoc(doc(db, 'usernames', trimmedUsername.toLowerCase()));
          if (usernameDoc.exists()) {
            const uid = usernameDoc.data().uid;
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (userDoc.exists()) {
              loginEmail = (userDoc.data() as UserProfile).email;
            } else {
              setAuthError('User data not found.');
              return;
            }
          } else {
            // Fallback for existing users without a usernames document
            const q = query(collection(db, 'users'), where('username', '==', trimmedUsername.toLowerCase()));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) {
              setAuthError('Username not found. Please register.');
              return;
            }
            loginEmail = (querySnapshot.docs[0].data() as UserProfile).email;
          }
        }
        await signInWithEmailAndPassword(auth, loginEmail, password);
      }
    } catch (err: any) {
      console.error('Auth error details:', {
        code: err.code,
        message: err.message,
        email: `${username.toLowerCase()}@taskboard.local`
      });
      if (err.code === 'auth/invalid-credential') {
        setAuthError('Invalid username or password. If you are new, please click "Register" first.');
      } else {
        setAuthError(err.message || 'Authentication failed');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetAllData = async () => {
    if (!isAdmin) return;
    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      
      // Delete all tasks
      const tasksSnapshot = await getDocs(collection(db, 'tasks'));
      tasksSnapshot.forEach(taskDoc => batch.delete(taskDoc.ref));
      
      // Delete all users
      const usersSnapshot = await getDocs(collection(db, 'users'));
      usersSnapshot.forEach(userDoc => batch.delete(userDoc.ref));

      // Delete all activities
      const activitiesSnapshot = await getDocs(collection(db, 'activities'));
      activitiesSnapshot.forEach(activityDoc => batch.delete(activityDoc.ref));
      
      await batch.commit();
      
      // Logout after reset
      await signOut(auth);
      setUser(null);
      setShowResetConfirm(false);
      setView('board');
      window.location.reload(); // Force reload to clear any local state
    } catch (err) {
      console.error('Reset error:', err);
      setError('Failed to reset data.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteUser = async (uid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAdmin) return;
    if (!window.confirm('Are you sure you want to delete this user profile?')) return;
    
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (err) {
      console.error('Delete user error:', err);
      setError('Failed to delete user.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setView('board');
      setIsEditingProfile(false);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const updateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newDisplayName.trim()) return;

    try {
      const userRef = doc(db, 'users', user.uid);
      const updatedPhotoURL = newPhotoURL.trim() || user.photoURL;
      await updateDoc(userRef, {
        displayName: newDisplayName.trim(),
        photoURL: updatedPhotoURL
      });
      
      // Update tasks where user is author
      const tasksQuery = query(collection(db, 'tasks'), where('userId', '==', user.uid));
      const taskDocs = await getDocs(tasksQuery);
      const batch = writeBatch(db);
      taskDocs.forEach(taskDoc => {
        batch.update(taskDoc.ref, { 
          userName: newDisplayName.trim(),
          userPhotoURL: updatedPhotoURL // Assuming we might want to update this if we added it to tasks
        });
      });
      
      // Update tasks where user is completer
      const completedQuery = query(collection(db, 'tasks'), where('completedBy', '==', user.uid));
      const completedDocs = await getDocs(completedQuery);
      completedDocs.forEach(taskDoc => {
        batch.update(taskDoc.ref, { completedByName: newDisplayName.trim() });
      });
      
      await batch.commit();
      setUser({ ...user, displayName: newDisplayName.trim(), photoURL: updatedPhotoURL });
      setIsEditingProfile(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !user) return;

    try {
      const tagsArray = newTaskTags.split(',').map(t => t.trim()).filter(t => t !== '');
      const taskId = Math.random().toString(36).substring(2, 15);
      const newTask: any = {
        id: taskId,
        userId: user.uid,
        userName: user.displayName,
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim(),
        priority: newTaskPriority,
        tags: tagsArray,
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (newTaskDueDate) {
        newTask.dueDate = newTaskDueDate;
      }

      await setDoc(doc(db, 'tasks', taskId), newTask);
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskDueDate('');
      setNewTaskPriority('medium');
      setNewTaskTags('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'tasks');
    }
  };

  const updateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editingTask.title.trim()) return;

    try {
      const tagsArray = typeof editingTask.tags === 'string' 
        ? (editingTask.tags as string).split(',').map(t => t.trim()).filter(t => t !== '')
        : editingTask.tags;

      const updateData: any = {
        title: editingTask.title.trim(),
        description: editingTask.description?.trim() || '',
        priority: editingTask.priority || 'medium',
        tags: tagsArray || [],
        updatedAt: new Date().toISOString()
      };

      if (editingTask.dueDate) {
        updateData.dueDate = editingTask.dueDate;
      }

      await updateDoc(doc(db, 'tasks', editingTask.id), updateData);
      setEditingTask(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${editingTask.id}`);
    }
  };

  const toggleTask = async (task: Task) => {
    if (!user) return;
    try {
      const newStatus = !task.completed;
      if (newStatus) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#1c1917', '#44403c', '#78716c']
        });
      }
      
      const batch = writeBatch(db);
      const taskRef = doc(db, 'tasks', task.id);
      const userRef = doc(db, 'users', user.uid);
      
      const taskUpdate: any = {
        completed: newStatus,
        updatedAt: new Date().toISOString()
      };
      
      if (newStatus) {
        taskUpdate.completedBy = user.uid;
        taskUpdate.completedByName = user.displayName;
      } else {
        // Use deleteField() or just don't include it if we want to clear it
        // For simplicity, let's just set them to empty strings or null if the schema allows
        taskUpdate.completedBy = "";
        taskUpdate.completedByName = "";
      }
      
      batch.update(taskRef, taskUpdate);
      
      batch.update(userRef, {
        completedCount: increment(newStatus ? 1 : -1)
      });
      
      await batch.commit();
      setUndoTask({ id: task.id, completed: task.completed });
      setTimeout(() => setUndoTask(prev => prev?.id === task.id ? null : prev), 5000);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${task.id}`);
    }
  };

  const handleUndo = async () => {
    if (!undoTask || !user) return;
    try {
      const batch = writeBatch(db);
      const taskRef = doc(db, 'tasks', undoTask.id);
      const userRef = doc(db, 'users', user.uid);
      
      const taskUpdate: any = {
        completed: undoTask.completed,
        updatedAt: new Date().toISOString()
      };
      
      if (undoTask.completed) {
        taskUpdate.completedBy = user.uid;
        taskUpdate.completedByName = user.displayName;
      } else {
        taskUpdate.completedBy = "";
        taskUpdate.completedByName = "";
      }
      
      batch.update(taskRef, taskUpdate);
      
      batch.update(userRef, {
        completedCount: increment(undoTask.completed ? 1 : -1)
      });
      
      await batch.commit();
      setUndoTask(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${undoTask.id}`);
    }
  };

  const deleteTask = async (id: string) => {
    if (!isAdmin) return;
    try {
      await deleteDoc(doc(db, 'tasks', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `tasks/${id}`);
    }
  };

  const handleShare = async (task: Task) => {
    const text = `Task: ${task.title}\n${task.description ? `Description: ${task.description}\n` : ''}Priority: ${task.priority}\nDue: ${task.dueDate || 'No due date'}`;
    try {
      await navigator.clipboard.writeText(text);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  const addComment = async (taskId: string) => {
    if (!user || !newComment.trim()) return;
    try {
      const commentId = Math.random().toString(36).substring(2, 15);
      const comment: any = {
        id: commentId,
        userId: user.uid,
        userName: user.displayName,
        userPhotoURL: user.photoURL,
        text: newComment.trim(),
        createdAt: new Date().toISOString()
      };

      const taskRef = doc(db, 'tasks', taskId);
      const taskSnap = await getDoc(taskRef);
      if (taskSnap.exists()) {
        const taskData = taskSnap.data() as Task;
        const updatedComments = [...(taskData.comments || []), comment];
        await updateDoc(taskRef, {
          comments: updatedComments,
          updatedAt: new Date().toISOString()
        });
        setNewComment('');
        // Update selectedTask if it's the one being commented on
        if (selectedTask?.id === taskId) {
          setSelectedTask({ ...taskData, comments: updatedComments });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${taskId}`);
    }
  };

  const sendChatMessage = async () => {
    if (!user || !newChatMessage.trim()) return;
    try {
      const messageId = Math.random().toString(36).substring(2, 15);
      
      // Detect mentions
      const mentionRegex = /@(\w+)/g;
      const mentions: string[] = [];
      let match;
      while ((match = mentionRegex.exec(newChatMessage)) !== null) {
        mentions.push(match[1].toLowerCase());
      }

      const message: any = {
        id: messageId,
        userId: user.uid,
        userName: user.displayName,
        userPhotoURL: user.photoURL,
        text: newChatMessage.trim(),
        createdAt: new Date().toISOString(),
      };

      if (mentions.length > 0) {
        message.mentions = mentions;
      }

      if (replyingTo) {
        message.replyTo = {
          id: replyingTo.id,
          userName: replyingTo.userName,
          text: replyingTo.text
        };
      }

      await setDoc(doc(db, 'chats', messageId), message);
      setNewChatMessage('');
      setReplyingTo(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'chats');
    }
  };

  const clearCompleted = async () => {
    const completedTasks = tasks.filter(t => t.completed);
    if (completedTasks.length === 0) return;
    try {
      const batch = writeBatch(db);
      completedTasks.forEach(t => {
        batch.delete(doc(db, 'tasks', t.id));
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'tasks');
    }
  };

  const isOnline = (lastActive: string) => {
    if (!lastActive) return false;
    const lastActiveDate = new Date(lastActive);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return lastActiveDate > fiveMinutesAgo;
  };

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = 
      filter === 'all' ? true :
      filter === 'active' ? !task.completed :
      task.completed;
    return matchesSearch && matchesFilter;
  }).sort((a, b) => {
    if (sortBy === 'createdAt') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (sortBy === 'dueDate') {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    if (sortBy === 'priority') {
      const pMap = { high: 3, medium: 2, low: 1 };
      const valA = pMap[a.priority || 'medium'];
      const valB = pMap[b.priority || 'medium'];
      return valB - valA;
    }
    return 0;
  });

  const getDueDateStatus = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return { label: 'Today', color: 'text-amber-600 bg-amber-50' };
    if (isPast(date)) return { label: 'Overdue', color: 'text-red-600 bg-red-50' };
    return { label: format(date, 'MMM d'), color: 'text-stone-500 bg-stone-50' };
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50 border-red-100';
      case 'medium': return 'text-amber-600 bg-amber-50 border-amber-100';
      case 'low': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
      case 'idea': return 'text-violet-600 bg-violet-50 border-violet-100';
      case 'none': return 'text-stone-400 bg-stone-50 border-stone-100';
      default: return 'text-stone-500 bg-stone-50 border-stone-100';
    }
  };

  const stats = {
    total: tasks.length,
    completed: tasks.filter(t => t.completed).length,
    active: tasks.filter(t => !t.completed).length,
    overdue: tasks.filter(t => !t.completed && t.dueDate && isPast(parseISO(t.dueDate)) && !isToday(parseISO(t.dueDate))).length
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-stone-200/50 p-8 border border-stone-100"
        >
          <div className="w-16 h-16 bg-stone-900 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Layout className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-semibold text-stone-900 mb-2 tracking-tight text-center">
            {isRegistering ? 'Create Account' : 'Welcome Back'}
          </h1>
          <p className="text-stone-500 mb-8 leading-relaxed text-center">
            {isRegistering ? 'Join the collaborative task board.' : 'Sign in to manage your tasks.'}
          </p>
          
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">
                {isRegistering ? 'Choose Username' : 'Username or Email'}
              </label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={isRegistering ? "e.g. GIO" : "Username or email@example.com"}
                  required
                  className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-4 pl-12 pr-6 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all"
                />
              </div>
            </div>

            {isRegistering && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Email Address</label>
                <div className="relative">
                  <Plus className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    required
                    className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-4 pl-12 pr-6 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-4 pl-12 pr-6 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all"
                />
              </div>
            </div>

            {authError && (
              <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-stone-900 text-white rounded-2xl py-4 font-medium hover:bg-stone-800 transition-colors shadow-lg shadow-stone-900/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {isRegistering ? 'Register' : 'Login'}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              onClick={() => {
                setIsRegistering(!isRegistering);
                setAuthError(null);
              }}
              className="text-sm text-stone-500 hover:text-stone-900 transition-colors font-medium"
            >
              {isRegistering ? 'Already have an account? Login' : 'Need an account? Register'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans selection:bg-stone-200">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-stone-900 rounded-lg flex items-center justify-center">
              <Layout className="text-white w-5 h-5" />
            </div>
            <span className="font-semibold tracking-tight">giosnotes</span>
          </div>
          
          <div className="flex items-center gap-4">
            {isAdmin && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-amber-50 text-amber-600 border border-amber-100">
                <Lock className="w-3 h-3" />
                Admin
              </div>
            )}
            <a 
              href="https://giosnotes.vercel.app/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-stone-100 text-stone-600 hover:bg-stone-200 transition-all"
            >
              My Notes
            </a>
            {isServerOnline !== null && (
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border ${isServerOnline ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-red-600 bg-red-50 border-red-100'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${isServerOnline ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
                {isServerOnline ? 'Online' : 'Offline'}
              </div>
            )}
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setIsEditingProfile(true)}>
              <img 
                src={user.photoURL} 
                alt={user.displayName}
                className="w-10 h-10 rounded-full border border-stone-200 shadow-sm group-hover:border-stone-400 transition-all"
                referrerPolicy="no-referrer"
              />
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium leading-none group-hover:text-stone-600 transition-colors">{user.displayName}</p>
                <p className="text-[10px] text-stone-400 uppercase tracking-wider font-bold mt-1">{user.completedCount} Tasks Fixed</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-400 hover:text-stone-600"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-3xl mx-auto px-4 mt-2 flex gap-6">
          {[
            { id: 'board', label: 'Board', icon: Layout },
            { id: 'scoreboard', label: 'Scoreboard', icon: Trophy },
            { id: 'profiles', label: 'Users', icon: Users },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setView(tab.id as any);
                setSelectedProfile(null);
              }}
              className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-all ${
                view === tab.id 
                  ? 'border-stone-900 text-stone-900' 
                  : 'border-transparent text-stone-400 hover:text-stone-600'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
          <button
            onClick={() => setIsChatOpen(true)}
            className="flex items-center gap-2 py-3 text-sm font-medium border-b-2 border-transparent text-stone-400 hover:text-stone-600 transition-all relative"
          >
            <MessageSquare className="w-4 h-4" />
            Chat
            {chatMessages.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full border-2 border-white" />
            )}
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {view === 'board' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              {/* Stats Dashboard */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                {[
                  { label: 'Total', value: stats.total, icon: BarChart3, color: 'text-stone-600 bg-stone-100' },
                  { label: 'Active', value: stats.active, icon: Clock, color: 'text-amber-600 bg-amber-50' },
                  { label: 'Completed', value: stats.completed, icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50' },
                  { label: 'Overdue', value: stats.overdue, icon: AlertCircle, color: 'text-red-600 bg-red-50' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <stat.icon className={`w-4 h-4 ${stat.color.split(' ')[0]}`} />
                      <span className="text-xl font-bold text-stone-900">{stat.value}</span>
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{stat.label}</p>
                  </div>
                ))}
              </div>

              {error && (
                <div className="mb-6 bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm">{error}</p>
                  <button onClick={() => setError(null)} className="ml-auto text-xs font-bold uppercase tracking-wider">Dismiss</button>
                </div>
              )}

              {/* Add Task */}
              <form onSubmit={addTask} className="mb-8 bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Task Title</label>
                    <input
                      type="text"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="What needs to be done?"
                      className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Due Date (Optional)</label>
                    <input
                      type="date"
                      value={newTaskDueDate}
                      onChange={(e) => setNewTaskDueDate(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Priority</label>
                    <div className="flex flex-wrap gap-2">
                      {(['none', 'idea', 'low', 'medium', 'high'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setNewTaskPriority(p)}
                          className={`flex-1 min-w-[70px] py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all ${
                            newTaskPriority === p 
                              ? getPriorityColor(p) + ' border-current'
                              : 'bg-stone-50 text-stone-400 border-stone-200 hover:border-stone-300'
                          }`}
                        >
                          {p === 'idea' && <Lightbulb className="w-3 h-3 inline-block mr-1 -mt-0.5" />}
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Tags (Comma separated)</label>
                    <div className="relative">
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                      <input
                        type="text"
                        value={newTaskTags}
                        onChange={(e) => setNewTaskTags(e.target.value)}
                        placeholder="work, urgent, home..."
                        className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Description (Optional)</label>
                  <textarea
                    value={newTaskDescription}
                    onChange={(e) => setNewTaskDescription(e.target.value)}
                    placeholder="Add some details..."
                    rows={2}
                    className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all resize-none"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={!newTaskTitle.trim()}
                    className="flex-[2] bg-stone-900 text-white rounded-2xl py-3 font-medium hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-stone-900/10"
                  >
                    <Plus className="w-5 h-5" />
                    Add Task
                  </button>
                  <button
                    type="button"
                    disabled={!newTaskTitle.trim()}
                    onClick={(e) => {
                      setNewTaskPriority('idea');
                      addTask(e);
                    }}
                    className="flex-1 bg-violet-100 text-violet-700 rounded-2xl py-3 font-medium hover:bg-violet-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Lightbulb className="w-4 h-4" />
                    Just an Idea
                  </button>
                </div>
              </form>

              {/* Filters & Search */}
              <div className="mb-6 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="flex bg-white p-1 rounded-xl border border-stone-200 shadow-sm w-full sm:w-auto">
                    {(['all', 'active', 'completed'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${
                          filter === f 
                            ? 'bg-stone-900 text-white shadow-md' 
                            : 'text-stone-500 hover:text-stone-900'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-grow sm:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search tasks..."
                        className="w-full bg-white border border-stone-200 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-stone-900 transition-all shadow-sm"
                      />
                    </div>
                    {isAdmin && stats.completed > 0 && (
                      <button
                        onClick={clearCompleted}
                        className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title="Clear Completed"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400 flex-shrink-0">Sort by:</span>
                  {(['createdAt', 'dueDate', 'priority'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSortBy(s)}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all flex-shrink-0 ${
                        sortBy === s
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      {s === 'createdAt' ? 'Newest' : s === 'dueDate' ? 'Due Date' : 'Priority'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Task List */}
              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {filteredTasks.map((task) => (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      onClick={() => setSelectedTask(task)}
                      className={`group flex items-start gap-4 bg-white p-5 rounded-3xl border border-stone-200 shadow-sm hover:shadow-md hover:border-stone-300 transition-all cursor-pointer ${
                        task.completed ? 'opacity-60' : ''
                      }`}
                    >
                      <div
                        className={`mt-1 flex-shrink-0 transition-colors ${
                          task.completed ? 'text-emerald-500' : 'text-stone-300 group-hover:text-stone-400'
                        }`}
                      >
                        {task.completed ? (
                          <CheckCircle2 className="w-6 h-6" />
                        ) : (
                          <Circle className="w-6 h-6" />
                        )}
                      </div>
                      
                      <div className="flex-grow min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <p className={`text-base font-semibold truncate ${task.completed ? 'line-through text-stone-400' : 'text-stone-900'}`}>
                              {task.title}
                            </p>
                            <div className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border flex items-center gap-1 ${getPriorityColor(task.priority)}`}>
                              {task.priority === 'idea' && <Lightbulb className="w-2.5 h-2.5" />}
                              {task.priority || 'medium'}
                            </div>
                            <span className="text-[9px] bg-stone-900 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex-shrink-0">
                              {task.userName}
                            </span>
                            {task.comments && task.comments.length > 0 && (
                              <div className="flex items-center gap-1 text-[10px] font-bold text-stone-400 bg-stone-50 px-2 py-0.5 rounded-full">
                                <MessageSquare className="w-3 h-3" />
                                {task.comments.length}
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1">
                            {task.dueDate && !task.completed && (
                              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tight ${getDueDateStatus(task.dueDate).color}`}>
                                <Calendar className="w-3 h-3" />
                                {getDueDateStatus(task.dueDate).label}
                              </div>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShare(task);
                              }}
                              className="p-1.5 text-stone-300 hover:text-stone-600 hover:bg-stone-50 rounded-lg transition-all"
                              title="Share Task"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        
                        {task.description && (
                          <p className={`text-sm mb-3 leading-relaxed ${task.completed ? 'text-stone-400' : 'text-stone-500'}`}>
                            {task.description}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2 mb-3">
                          {task.tags?.map((tag, idx) => (
                            <span key={idx} className="flex items-center gap-1 text-[10px] font-medium text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
                              <Tag className="w-2.5 h-2.5" />
                              {tag}
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center gap-3">
                          <p className="text-[10px] text-stone-400 uppercase tracking-wider font-bold">
                            {task.updatedAt ? `Updated ${formatDistanceToNow(new Date(task.updatedAt))} ago` : 'Just now'}
                          </p>
                          <span className="w-1 h-1 bg-stone-200 rounded-full" />
                          <p className="text-[10px] text-stone-400 uppercase tracking-wider font-bold">
                            Created by {task.userName}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setEditingTask(task)}
                          className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => deleteTask(task.id)}
                            className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {filteredTasks.length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Filter className="text-stone-300 w-6 h-6" />
                    </div>
                    <p className="text-stone-500 text-sm">No tasks found matching your criteria.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar Activity */}
            <div className="hidden lg:block space-y-6">
              <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
                <h3 className="text-sm font-bold uppercase tracking-widest text-stone-400 mb-6 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Recent Activity
                </h3>
                <div className="space-y-6">
                  {activities.length > 0 ? activities.map((activity) => (
                    <div key={activity.id} className="relative pl-6 border-l border-stone-100">
                      <div className={`absolute left-[-5px] top-0 w-2.5 h-2.5 rounded-full border-2 border-white ${activity.completed ? 'bg-emerald-500' : activity.comments && activity.comments.length > 0 && Math.abs(new Date(activity.updatedAt).getTime() - new Date(activity.comments[activity.comments.length - 1].createdAt).getTime()) < 1000 ? 'bg-amber-400' : 'bg-stone-300'}`} />
                      <p className="text-xs font-semibold text-stone-900 leading-tight mb-1">
                        {activity.comments && activity.comments.length > 0 && Math.abs(new Date(activity.updatedAt).getTime() - new Date(activity.comments[activity.comments.length - 1].createdAt).getTime()) < 1000 
                          ? `${activity.comments[activity.comments.length - 1].userName} commented on "${activity.title}"`
                          : activity.completed 
                            ? `${activity.completedByName || activity.userName} completed "${activity.title}"`
                            : `${activity.userName} updated "${activity.title}"`
                        }
                      </p>
                      <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">
                        {formatDistanceToNow(new Date(activity.updatedAt))} ago
                      </p>
                    </div>
                  )) : (
                    <p className="text-xs text-stone-400 italic">No recent activity</p>
                  )}
                </div>
              </div>

              <div className="bg-stone-900 p-6 rounded-3xl text-white">
                <Trophy className="w-8 h-8 text-amber-400 mb-4" />
                <h3 className="text-lg font-bold mb-2">Top Contributor</h3>
                {users.length > 0 && (
                  <div className="flex items-center gap-3">
                    <img src={users[0].photoURL} className="w-10 h-10 rounded-full border border-white/20" alt="" referrerPolicy="no-referrer" />
                    <div>
                      <p className="text-sm font-bold">{users[0].displayName}</p>
                      <p className="text-xs text-stone-400">{users[0].completedCount} Tasks Fixed</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {view === 'scoreboard' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="bg-stone-900 text-white p-8 rounded-[2.5rem] shadow-2xl shadow-stone-900/20 relative overflow-hidden">
              <Trophy className="absolute right-[-20px] bottom-[-20px] w-48 h-48 opacity-10 rotate-12" />
              <h2 className="text-3xl font-bold mb-2">Leaderboard</h2>
              <p className="text-stone-400 text-sm">Top contributors on the board</p>
            </div>

            <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
              {users.map((u, idx) => (
                <div 
                  key={u.uid}
                  className={`flex items-center gap-4 p-4 border-b border-stone-100 last:border-0 hover:bg-stone-50 transition-colors cursor-pointer ${u.uid === user.uid ? 'bg-stone-50/50' : ''}`}
                  onClick={() => {
                    setSelectedProfile(u.uid);
                    setView('profiles');
                  }}
                >
                  <div className="w-8 text-center font-bold text-stone-300">
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                  </div>
                  <div className="relative">
                    <img src={u.photoURL} className="w-12 h-12 rounded-full border border-stone-200" alt={u.displayName} referrerPolicy="no-referrer" />
                    {isOnline(u.lastActive) && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full shadow-sm" />
                    )}
                  </div>
                  <div className="flex-grow">
                    <p className="font-semibold text-stone-900">{u.displayName}</p>
                    <p className="text-xs text-stone-400">Contributor</p>
                  </div>
                  <div className="text-right flex items-center gap-4">
                    <div>
                      <p className="text-xl font-bold text-stone-900">{u.completedCount}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Fixed</p>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={(e) => deleteUser(u.uid, e)}
                        className="p-2 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title="Delete User Profile"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {isAdmin && (
              <div className="pt-12 pb-8 border-t border-stone-100">
                {!showResetConfirm ? (
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    className="w-full py-4 text-stone-400 hover:text-red-500 text-xs font-bold uppercase tracking-widest transition-all"
                  >
                    System Reset
                  </button>
                ) : (
                  <div className="bg-red-50 p-6 rounded-3xl border border-red-100 text-center space-y-4">
                    <p className="text-red-600 text-sm font-bold">Are you absolutely sure? This will delete ALL tasks and ALL user profiles.</p>
                    <div className="flex gap-3">
                      <button
                        onClick={resetAllData}
                        disabled={isSubmitting}
                        className="flex-1 bg-red-600 text-white py-3 rounded-2xl font-bold text-sm hover:bg-red-700 transition-all disabled:opacity-50"
                      >
                        {isSubmitting ? 'Resetting...' : 'Yes, Delete Everything'}
                      </button>
                      <button
                        onClick={() => setShowResetConfirm(false)}
                        className="flex-1 bg-white text-stone-600 py-3 rounded-2xl font-bold text-sm border border-stone-200 hover:bg-stone-50 transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {view === 'profiles' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {!selectedProfile ? (
              <div className="space-y-8">
                {/* Online Now Section */}
                {users.filter(u => isOnline(u.lastActive)).length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 ml-2 flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      Online Now
                    </h3>
                    <div className="flex flex-wrap gap-4">
                      {users.filter(u => isOnline(u.lastActive)).map(u => (
                        <div 
                          key={u.uid}
                          onClick={() => setSelectedProfile(u.uid)}
                          className="flex flex-col items-center gap-2 cursor-pointer group"
                        >
                          <div className="relative">
                            <img src={u.photoURL} className="w-14 h-14 rounded-full border-2 border-emerald-100 group-hover:border-emerald-500 transition-all shadow-sm" alt={u.displayName} referrerPolicy="no-referrer" />
                            <div className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full shadow-sm" />
                          </div>
                          <span className="text-[10px] font-bold text-stone-600 group-hover:text-stone-900 transition-colors">{u.displayName?.split(' ')[0]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {users.map(u => (
                    <div 
                      key={u.uid}
                      onClick={() => setSelectedProfile(u.uid)}
                      className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center gap-4 relative overflow-hidden"
                    >
                      <div className="relative">
                        <img src={u.photoURL} className="w-14 h-14 rounded-full border border-stone-200" alt={u.displayName} referrerPolicy="no-referrer" />
                        {isOnline(u.lastActive) && (
                          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full shadow-sm" />
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-stone-900">{u.displayName}</p>
                        <p className="text-[10px] text-stone-400 font-medium uppercase tracking-wider">
                          {isOnline(u.lastActive) ? 'Active Now' : `Active ${formatDistanceToNow(new Date(u.lastActive))} ago`}
                        </p>
                      </div>
                      {isOnline(u.lastActive) && (
                        <div className="absolute top-2 right-2 px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-bold uppercase tracking-wider rounded-full border border-emerald-100">
                          Online
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <button 
                  onClick={() => setSelectedProfile(null)}
                  className="flex items-center gap-2 text-sm font-bold text-stone-400 hover:text-stone-900 transition-colors"
                >
                  <X className="w-4 h-4" /> Back to Users
                </button>
                
                {users.find(u => u.uid === selectedProfile) && (
                  <div className="bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm flex flex-col items-center text-center">
                    <img 
                      src={users.find(u => u.uid === selectedProfile)?.photoURL} 
                      className="w-24 h-24 rounded-full border-4 border-stone-50 shadow-lg mb-4" 
                      alt="Profile" 
                      referrerPolicy="no-referrer"
                    />
                    <h2 className="text-2xl font-bold text-stone-900">{users.find(u => u.uid === selectedProfile)?.displayName}</h2>
                    <p className="text-stone-400 text-sm mb-6">Contributor</p>
                    
                    <div className="grid grid-cols-2 gap-8 w-full max-w-sm">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-stone-900">{users.find(u => u.uid === selectedProfile)?.completedCount}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Total Fixed</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-stone-900">
                          {tasks.filter(t => t.userId === selectedProfile).length}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Tasks Created</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-8">
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 ml-2">Tasks Created</h3>
                    {tasks.filter(t => t.userId === selectedProfile).length === 0 && (
                      <p className="text-stone-400 text-xs italic ml-2">No tasks created yet.</p>
                    )}
                    {tasks.filter(t => t.userId === selectedProfile).map(task => (
                      <div key={task.id} className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {task.completed ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Circle className="w-5 h-5 text-stone-300" />}
                          <span className={`text-sm font-medium ${task.completed ? 'line-through text-stone-400' : 'text-stone-900'}`}>{task.title}</span>
                        </div>
                        <div className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${getPriorityColor(task.priority)}`}>
                          {task.priority || 'medium'}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 ml-2">Recent Accomplishments</h3>
                    {tasks.filter(t => t.completedBy === selectedProfile).length === 0 && (
                      <p className="text-stone-400 text-xs italic ml-2">No tasks completed yet.</p>
                    )}
                    {tasks.filter(t => t.completedBy === selectedProfile).map(task => (
                      <div key={task.id} className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          <span className="text-sm font-medium text-stone-900">{task.title}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-stone-400">Fixed</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {isAdmin && (
              <div className="pt-12 pb-8 border-t border-stone-100">
                {!showResetConfirm ? (
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    className="w-full py-4 text-stone-400 hover:text-red-500 text-xs font-bold uppercase tracking-widest transition-all"
                  >
                    System Reset
                  </button>
                ) : (
                  <div className="bg-red-50 p-6 rounded-3xl border border-red-100 text-center space-y-4">
                    <p className="text-red-600 text-sm font-bold">Are you absolutely sure? This will delete ALL tasks and ALL user profiles.</p>
                    <div className="flex gap-3">
                      <button
                        onClick={resetAllData}
                        disabled={isSubmitting}
                        className="flex-1 bg-red-600 text-white py-3 rounded-2xl font-bold text-sm hover:bg-red-700 transition-all disabled:opacity-50"
                      >
                        {isSubmitting ? 'Resetting...' : 'Yes, Delete Everything'}
                      </button>
                      <button
                        onClick={() => setShowResetConfirm(false)}
                        className="flex-1 bg-white text-stone-600 py-3 rounded-2xl font-bold text-sm border border-stone-200 hover:bg-stone-50 transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </main>

      <footer className="max-w-3xl mx-auto px-4 py-12 text-center space-y-4">
        <p className="text-xs text-stone-400 font-medium uppercase tracking-[0.2em]">
          giosnotes • Real-time
        </p>
        <div className="flex justify-center gap-4">
          <a 
            href="https://giosnotes.vercel.app/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[10px] font-bold uppercase tracking-widest text-stone-400 hover:text-stone-900 transition-colors"
          >
            Visit giosnotes
          </a>
        </div>
      </footer>

      {/* Profile Edit Modal */}
      <AnimatePresence>
        {isEditingProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/20 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-stone-200 overflow-hidden"
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-stone-900">Edit Profile</h2>
                <button onClick={() => setIsEditingProfile(false)} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-stone-400" />
                </button>
              </div>
              <form onSubmit={updateProfile} className="p-6 space-y-6">
                <div className="flex flex-col items-center gap-4 mb-4">
                  <div className="relative group">
                    <img 
                      src={newPhotoURL || user.photoURL} 
                      className="w-24 h-24 rounded-full border-4 border-stone-50 shadow-lg object-cover" 
                      alt="" 
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Edit2 className="text-white w-6 h-6" />
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {['vibrant', 'fun', 'cool', 'smart', 'calm'].map(seed => (
                      <button
                        key={seed}
                        type="button"
                        onClick={() => setNewPhotoURL(`https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`)}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${newPhotoURL.includes(seed) ? 'border-stone-900 scale-110' : 'border-transparent hover:scale-105'}`}
                      >
                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`} className="rounded-full" alt="" referrerPolicy="no-referrer" />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Display Name</label>
                    <input
                      type="text"
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      placeholder="e.g. Gio the Great"
                      required
                      className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Custom Photo URL (Optional)</label>
                    <input
                      type="url"
                      value={newPhotoURL}
                      onChange={(e) => setNewPhotoURL(e.target.value)}
                      placeholder="https://example.com/photo.jpg"
                      className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all text-xs"
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="flex-1 px-4 py-3 rounded-2xl border border-stone-200 text-stone-600 font-medium hover:bg-stone-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-stone-900 text-white rounded-2xl py-3 font-medium hover:bg-stone-800 transition-colors shadow-lg shadow-stone-900/10"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Undo Notification */}
      <AnimatePresence>
        {undoTask && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-stone-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border border-stone-800"
          >
            <span className="text-sm font-medium">Task updated</span>
            <button
              onClick={handleUndo}
              className="text-xs font-bold uppercase tracking-widest text-stone-400 hover:text-white transition-colors"
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task Detail Modal */}
      <AnimatePresence>
        {selectedTask && (
          <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-lg rounded-[32px] p-8 shadow-2xl relative"
            >
              <button
                onClick={() => setSelectedTask(null)}
                className="absolute right-6 top-6 p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-full transition-all"
              >
                <X className="w-6 h-6" />
              </button>

              <button
                onClick={() => handleShare(selectedTask)}
                className="absolute right-16 top-6 p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-full transition-all"
                title="Share Task"
              >
                {showCopied ? <Check className="w-6 h-6 text-emerald-500" /> : <Share2 className="w-6 h-6" />}
              </button>

              <div className="mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1.5 ${getPriorityColor(selectedTask.priority || 'medium')} border-current`}>
                    {selectedTask.priority === 'idea' && <Lightbulb className="w-3 h-3" />}
                    {selectedTask.priority || 'medium'}
                  </span>
                  {selectedTask.dueDate && (
                    <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${isPast(parseISO(selectedTask.dueDate)) && !selectedTask.completed ? 'text-red-500' : 'text-stone-400'}`}>
                      <Calendar className="w-3.5 h-3.5" />
                      {format(parseISO(selectedTask.dueDate), 'MMM d, yyyy')}
                    </span>
                  )}
                </div>
                
                <h2 className={`text-2xl font-bold text-stone-900 mb-4 leading-tight ${selectedTask.completed ? 'line-through opacity-50' : ''}`}>
                  {selectedTask.title}
                </h2>

                {selectedTask.description && (
                  <div className="bg-stone-50 rounded-2xl p-5 mb-6">
                    <p className="text-stone-600 leading-relaxed whitespace-pre-wrap">
                      {selectedTask.description}
                    </p>
                  </div>
                )}

                {selectedTask.tags && selectedTask.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-6">
                    {selectedTask.tags.map(tag => (
                      <span key={tag} className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 text-stone-600 rounded-xl text-xs font-medium">
                        <Tag className="w-3 h-3" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-3 text-stone-400 text-xs border-t border-stone-100 pt-6 mb-6">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-[10px] font-bold text-stone-600">
                      {selectedTask.userName.charAt(0).toUpperCase()}
                    </div>
                    <span>Created by {selectedTask.userName}</span>
                  </div>
                  {selectedTask.completed && (
                    <div className="flex items-center gap-2 ml-auto">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>Completed by {selectedTask.completedByName}</span>
                    </div>
                  )}
                </div>

                {/* Comments Section */}
                <div className="border-t border-stone-100 pt-6 mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <MessageSquare className="w-4 h-4 text-stone-400" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">Comments</h3>
                  </div>

                  <div className="space-y-4 max-h-60 overflow-y-auto mb-4 pr-2 no-scrollbar">
                    {selectedTask.comments && selectedTask.comments.length > 0 ? (
                      selectedTask.comments.map((comment) => (
                        <div key={comment.id} className="flex gap-3">
                          <img
                            src={comment.userPhotoURL}
                            alt={comment.userName}
                            className="w-8 h-8 rounded-full flex-shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="flex-grow">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-xs font-bold text-stone-900">{comment.userName}</span>
                              <span className="text-[10px] text-stone-400">{format(parseISO(comment.createdAt), 'MMM d, h:mm a')}</span>
                            </div>
                            <p className="text-sm text-stone-600 leading-relaxed bg-stone-50 p-3 rounded-2xl rounded-tl-none">
                              {comment.text}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-stone-400 italic text-center py-4">No comments yet. Start the conversation!</p>
                    )}
                  </div>

                  <div className="relative">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          addComment(selectedTask.id);
                        }
                      }}
                      placeholder="Add a comment... (Shift+Enter for new line)"
                      rows={1}
                      className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-3 pl-4 pr-12 text-sm focus:outline-none focus:border-stone-900 transition-all resize-none min-h-[44px]"
                    />
                    <button
                      onClick={() => addComment(selectedTask.id)}
                      disabled={!newComment.trim()}
                      className="absolute right-2 bottom-2 p-2 text-stone-400 hover:text-stone-900 disabled:opacity-30 transition-all"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => {
                    toggleTask(selectedTask);
                    setSelectedTask(null);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all ${
                    selectedTask.completed
                      ? 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20'
                  }`}
                >
                  {selectedTask.completed ? (
                    <>
                      <Circle className="w-5 h-5" />
                      Mark Active
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      Complete Task
                    </>
                  )}
                </button>
                
                <div className="flex gap-3 flex-1">
                  <button
                    onClick={() => {
                      setEditingTask(selectedTask);
                      setSelectedTask(null);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-4 bg-stone-100 text-stone-600 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-stone-200 transition-all"
                  >
                    <Edit2 className="w-5 h-5" />
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      deleteTask(selectedTask.id);
                      setSelectedTask(null);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-4 bg-red-50 text-red-600 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-red-100 transition-all"
                  >
                    <Trash2 className="w-5 h-5" />
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/20 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-stone-200 overflow-hidden"
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-stone-900">Edit Task</h2>
                <button onClick={() => setEditingTask(null)} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-stone-400" />
                </button>
              </div>
              <form onSubmit={updateTask} className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Title</label>
                  <input
                    type="text"
                    value={editingTask.title}
                    onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Due Date</label>
                    <input
                      type="date"
                      value={editingTask.dueDate || ''}
                      onChange={(e) => setEditingTask({ ...editingTask, dueDate: e.target.value })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Priority</label>
                    <select
                      value={editingTask.priority || 'medium'}
                      onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value as any })}
                      className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all appearance-none"
                    >
                      <option value="none">None</option>
                      <option value="idea">Just an Idea</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Tags (Comma separated)</label>
                  <input
                    type="text"
                    value={Array.isArray(editingTask.tags) ? editingTask.tags.join(', ') : editingTask.tags || ''}
                    onChange={(e) => setEditingTask({ ...editingTask, tags: e.target.value as any })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Description</label>
                  <textarea
                    value={editingTask.description || ''}
                    onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                    rows={3}
                    className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingTask(null)}
                    className="flex-1 bg-stone-100 text-stone-600 rounded-2xl py-3 font-medium hover:bg-stone-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-stone-900 text-white rounded-2xl py-3 font-medium hover:bg-stone-800 transition-colors shadow-lg shadow-stone-900/10"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Chat Sidebar */}
      <AnimatePresence>
        {isChatOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsChatOpen(false)}
              className="fixed inset-0 bg-stone-900/20 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-white shadow-2xl z-[70] flex flex-col"
            >
              <div className="p-6 border-b border-stone-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-stone-900 rounded-2xl flex items-center justify-center">
                    <MessageSquare className="text-white w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-stone-900">Global Chat</h2>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                      {users.filter(u => isOnline(u.lastActive)).length} Online
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsChatOpen(false)}
                  className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-full transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-grow overflow-y-auto p-6 space-y-6 no-scrollbar">
                {chatMessages.length > 0 ? (
                  chatMessages.map((msg, idx) => {
                    const isMe = msg.userId === user?.uid;
                    const showHeader = idx === 0 || chatMessages[idx - 1].userId !== msg.userId;
                    
                    // Highlight mentions
                    const renderText = (text: string) => {
                      const parts = text.split(/(@\w+)/g);
                      return parts.map((part, i) => {
                        if (part.startsWith('@')) {
                          return <span key={i} className="font-bold text-emerald-400">{part}</span>;
                        }
                        return part;
                      });
                    };

                    return (
                      <div key={msg.id} className={`flex flex-col group ${isMe ? 'items-end' : 'items-start'}`}>
                        {showHeader && !isMe && (
                          <div className="flex items-center gap-2 mb-2 ml-1">
                            <img src={msg.userPhotoURL} className="w-5 h-5 rounded-full" alt="" referrerPolicy="no-referrer" />
                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">{msg.userName}</span>
                          </div>
                        )}
                        
                        {msg.replyTo && (
                          <div className={`mb-1 px-3 py-1.5 rounded-xl text-[10px] border ${isMe ? 'bg-stone-800 border-stone-700 text-stone-400' : 'bg-stone-50 border-stone-100 text-stone-500'} max-w-[80%] truncate`}>
                            <span className="font-bold block mb-0.5">Replying to {msg.replyTo.userName}</span>
                            {msg.replyTo.text}
                          </div>
                        )}

                        <div className="flex items-center gap-2 max-w-[85%]">
                          {!isMe && (
                            <button 
                              onClick={() => setReplyingTo(msg)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 text-stone-300 hover:text-stone-600 transition-all"
                              title="Reply"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <div className={`p-3 rounded-2xl text-sm leading-relaxed ${
                            isMe 
                              ? 'bg-stone-900 text-white rounded-tr-none shadow-lg shadow-stone-900/10' 
                              : 'bg-stone-100 text-stone-700 rounded-tl-none'
                          }`}>
                            {renderText(msg.text)}
                          </div>
                          {isMe && (
                            <button 
                              onClick={() => setReplyingTo(msg)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 text-stone-300 hover:text-stone-600 transition-all"
                              title="Reply"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <span className="text-[9px] text-stone-300 mt-1 px-1">
                          {formatDistanceToNow(new Date(msg.createdAt))} ago
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8">
                    <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center mb-4">
                      <MessageSquare className="text-stone-200 w-8 h-8" />
                    </div>
                    <p className="text-stone-400 text-sm italic">No messages yet. Say hi to the team!</p>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-stone-100">
                <AnimatePresence>
                  {replyingTo && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="mb-4 p-3 bg-stone-50 rounded-2xl border border-stone-100 flex items-center justify-between"
                    >
                      <div className="truncate pr-4">
                        <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-0.5">Replying to {replyingTo.userName}</p>
                        <p className="text-xs text-stone-600 truncate">{replyingTo.text}</p>
                      </div>
                      <button onClick={() => setReplyingTo(null)} className="p-1 text-stone-400 hover:text-stone-900">
                        <X className="w-4 h-4" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="relative">
                  <textarea
                    value={newChatMessage}
                    onChange={(e) => setNewChatMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendChatMessage();
                      }
                    }}
                    placeholder="Type a message..."
                    rows={1}
                    className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-4 pl-5 pr-14 text-sm focus:outline-none focus:border-stone-900 transition-all resize-none min-h-[56px] max-h-32"
                  />
                  <button
                    onClick={sendChatMessage}
                    disabled={!newChatMessage.trim()}
                    className="absolute right-3 bottom-3 p-2.5 bg-stone-900 text-white rounded-xl hover:bg-stone-800 disabled:opacity-30 transition-all shadow-lg shadow-stone-900/20"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
