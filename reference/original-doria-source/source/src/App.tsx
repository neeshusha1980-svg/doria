import { useEffect, useMemo, useState } from 'react';
import ThreeGame from './ThreeGame';
import GameChat from './GameChat';
import AvatarEditor from './AvatarEditor';
import BaseplateEditor from './BaseplateEditor';
import AvatarMarketplace from './AvatarMarketplace';
import CreatorGamepasses from './CreatorGamepasses';
import BadgeStudio, { BadgeGallery } from './BadgeStudio';
import './CreatorFeatures.css';
import './Onboarding.css';
import { auth, api } from '@appdeploy/client';
import { getApiErrorMessage } from './apiErrors';
import {
  Compass,
  Search,
  Sparkles,
  Gamepad2,
  Trophy,
  Coins,
  Plus,
  LogIn,
  LogOut,
  ArrowUpRight,
  Heart,
  Users,
  ShieldCheck,
  WandSparkles,
  Menu,
  X,
  CheckCircle2,
  LoaderCircle,
  Rocket,
  Crown,
  LayoutGrid,
  UserRound,
  UserPlus,
  BadgeCheck,
  Video,
  Shield,
  Palette,
  LockKeyhole,
  Check,
  Send,
  Newspaper,
  ListTodo,
  Orbit,
  Lightbulb,
  Sprout,
  Wrench,
  Star,
  Puzzle,
  Gem,
  Paperclip,
  Upload,
  ArrowDown,
  Download,
  FileText,
  Ban,
  Flag,
  Trash2,
} from 'lucide-react';

function DoriaLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="Doria logo" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M26 5.5V20.2C26 27.5 21.4 33 14.8 33C8.3 33 4.5 27.8 4.5 21.1C4.5 14.4 8.5 9.4 14.8 9.4C19.7 9.4 23.2 12.1 25.1 16.3" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M26 20.2C26 27.5 30.1 32.7 35.5 32.7" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round" />
    </svg>
  );
}

type Game = {
  id: string;
  name: string;
  genre: string;
  description: string;
  creatorName: string;
  plays: number;
  likes?: number;
  createdAt?: string;
  ownerId?: string;
  sceneData?: Array<{kind:string;x:number;z:number;color:string}>;
  creationMode?: 'html' | 'neo' | 'baseplate';
  htmlCode?: string;
  status?: string;
};
type Profile = {
  userId: string;
  displayName: string;
  starlits: number;
  trophies: string[];
  bio?: string;
  username?: string;
  equippedUgcId?: string;
};
type Page = 'discover' | 'studio' | 'starlits' | 'trophies' | 'plus' | 'profile' | 'friends' | 'moments' | 'news' | 'tasks' | 'parental' | 'gamepasses' | 'avatar' | 'admin' | 'privacy';
const gamePhotos: Record<string, string> = {
  Adventure: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=900&q=85',
  Obby: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=85',
  Roleplay: 'https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=900&q=85',
  Racing: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=85',
  Simulator: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=900&q=85',
  Puzzle: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=900&q=85',
  Social: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=900&q=85',
};
const genres = [
  'All',
  'Adventure',
  'Obby',
  'Roleplay',
  'Simulator',
  'Racing',
  'Puzzle',
  'Social',
];

const trophyCatalog = [
  { id: 'first-steps', title: 'First Steps', detail: 'Create an account and start exploring.', goal: 'Create your account' },
  { id: 'world-maker', title: 'World Maker', detail: 'Publish your first world.', goal: 'Publish 1 world' },
  { id: 'idea-starter', title: 'Idea Spark', detail: 'Complete the idea-starter creator quest.', goal: 'Claim the idea quest' },
  { id: 'rising-creator', title: 'Rising Creator', detail: 'Publish five worlds for the community.', goal: 'Publish 5 worlds' },
  { id: 'studio-veteran', title: 'Studio Veteran', detail: 'Publish ten worlds to Doria.', goal: 'Publish 10 worlds' },
];

function trophyIcon(id: string) {
  if (id === 'first-steps') return <Sprout size={22} />;
  if (id === 'world-maker') return <Wrench size={22} />;
  if (id === 'idea-starter') return <Lightbulb size={22} />;
  if (id === 'rising-creator') return <Star size={22} />;
  return <Trophy size={22} />;
}

function readPreference(key: string, fallback = '') {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
const art = [
  'art-peach',
  'art-violet',
  'art-teal',
  'art-gold',
  'art-pink',
  'art-blue',
];
function App() {
  const [gateStep, setGateStep] = useState<'account' | 'username' | 'home'>('account');
  const [page, setPage] = useState<Page>('discover');
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [detailGame, setDetailGame] = useState<Game | null>(null);
  const [likedGames, setLikedGames] = useState<string[]>([]);
  const [gameLikeCounts, setGameLikeCounts] = useState<Record<string, number>>({});
  const [creationMode, setCreationMode] = useState<'html'|'neo'|'baseplate'>('baseplate');
  const [htmlCode, setHtmlCode] = useState('<!doctype html><html><body style="font-family:sans-serif;background:#151324;color:white;text-align:center;padding:3rem"><h1>My Doria Game</h1><p>My first world</p><button onclick="this.textContent=\'You clicked!\'">Play</button></body></html>');
  const [neoPrompt, setNeoPrompt] = useState('A glowing crystal collecting adventure');
  const [newsAttachment, setNewsAttachment] = useState<{name:string;type:string;dataUrl:string}|null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [gamesNextToken, setGamesNextToken] = useState<string | null>(null);
  const [loadingMoreGames, setLoadingMoreGames] = useState(false);
  const [myGames, setMyGames] = useState<Game[]>([]);
  const [myGamesNextToken, setMyGamesNextToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [user, setUser] = useState<{
    userId: string;
    name?: string;
    email?: string;
  } | null>(null);
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('All');
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [errorText, setErrorText] = useState('');
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [gameGenre, setGameGenre] = useState('Adventure');
  const [description, setDescription] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<((() => Promise<void>) | null)>(null);
  const [plusActive, setPlusActive] = useState(false);
  const [aiUsage, setAiUsage] = useState<{plan:'free'|'plus';dailyAllowance?:number;promptsUsed?:number;promptsRemaining?:number;monthlyAllowance?:number;creditsUsed?:number;creditsRemaining?:number;period?:string}|null>(null);
  const [themeChoice, setThemeChoice] = useState(() => readPreference('doria-theme', 'midnight'));
  const [profileName, setProfileName] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [friendInput, setFriendInput] = useState('');
  const [friendStatus, setFriendStatus] = useState('');
  const [friends, setFriends] = useState<Array<{userId:string;username:string}>>([]);
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<Array<{id:string;userId:string;username:string;createdAt:string}>>([]);
  const [outgoingFriendRequests, setOutgoingFriendRequests] = useState<Array<{id:string;userId:string;username:string;createdAt:string}>>([]);
  const [friendActionBusy, setFriendActionBusy] = useState('');
  const [blockedUsers, setBlockedUsers] = useState<Array<{userId:string;username:string;createdAt:string}>>([]);
  const [privacyRequestBusy, setPrivacyRequestBusy] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [momentVideoFile, setMomentVideoFile] = useState<File | null>(null);
  const [momentVideoPreview, setMomentVideoPreview] = useState('');
  const [momentCaption, setMomentCaption] = useState('');
  const [momentBusy, setMomentBusy] = useState(false);
  const [moments, setMoments] = useState<Array<{id:string;ownerId:string;username:string;caption:string;videoUrl:string;createdAt:string}>>([]);
  const [newsText, setNewsText] = useState('');
  const [newsPosts, setNewsPosts] = useState<Array<{id:string;ownerId:string;username:string;text:string;attachments?:Array<{name:string;type:string;dataUrl:string}>;createdAt:string}>>([]);
  const [tasks, setTasks] = useState<Array<{id:string;title:string;detail:string;reward:number;completed:boolean;canClaim:boolean}>>([]);
  const [passes, setPasses] = useState<string[]>([]);
  const [gamepassCatalog, setGamepassCatalog] = useState<Array<{id:string;game:string;gameId:string;name:string;detail:string;price:number}>>([]);
  const [parentSettings, setParentSettings] = useState(() => ({ friendRequests: true, moments: true, chat: false, dailyLimit: 90 }));
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianMailto, setGuardianMailto] = useState('');
  const [guardianToken, setGuardianToken] = useState(() => new URLSearchParams(window.location.search).get('guardian') || '');
  const [guardianChildren, setGuardianChildren] = useState<Array<{childUserId:string;allowFriendRequests:boolean;allowMoments:boolean;allowChat:boolean;dailyLimit:number;multiplayerEnabled:boolean}>>([]);
  const [parentalLinked, setParentalLinked] = useState(false);
  const [parentalBusy, setParentalBusy] = useState(false);
  const [parentalMessage, setParentalMessage] = useState('');
  const [parentalError, setParentalError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminReports, setAdminReports] = useState<Array<{id:string;targetType:string;targetId:string;reason:string;details?:string;status:string;createdAt:string}>>([]);
  const [adminPrivacyRequests, setAdminPrivacyRequests] = useState<Array<{id:string;userId:string;requestType:string;status:string;createdAt:string}>>([]);
  const [adminBusy, setAdminBusy] = useState('');

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  }

  useEffect(() => {
    if (!mobileNav) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNav(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileNav]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {
        console.warn('Doria offline support could not be registered.');
      });
    }
    const handleInstall = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
      setInstallPrompt(() => async () => {
        try {
          await promptEvent.prompt();
          const choice = await promptEvent.userChoice;
          if (choice.outcome === 'accepted') notify('Doria installation started.');
        } catch (installError) {
          console.warn('Doria install prompt was unavailable or dismissed.', installError);
        } finally {
          setInstallPrompt(null);
        }
      });
    };
    window.addEventListener('beforeinstallprompt', handleInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleInstall);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.doriaTheme = plusActive ? themeChoice : 'midnight';
    try {
      localStorage.setItem('doria-theme', themeChoice);
    } catch {
      console.warn('Doria theme preference could not be saved in this browser.');
    }
  }, [plusActive, themeChoice]);

  async function loadGames() {
    try {
      const result = await api.get('/api/games', { params: { limit: 30 } });
      if (Array.isArray(result.data?.games)) {
        setGames(result.data.games);
        setGamesNextToken(result.data.nextToken || null);
      }
    } catch {
      setErrorText(
        'Community worlds could not be loaded. Check your connection and retry.'
      );
    }
  }

  async function loadMoreGames() {
    if (!gamesNextToken || loadingMoreGames) return;
    setLoadingMoreGames(true);
    try {
      const result = await api.get('/api/games', { params: { limit: 30, nextToken: gamesNextToken } });
      const incoming = Array.isArray(result.data?.games) ? result.data.games : [];
      setGames(current => {
        const unique = new Map(current.map(game => [game.id, game]));
        incoming.forEach((game: Game) => unique.set(game.id, game));
        return Array.from(unique.values());
      });
      setGamesNextToken(result.data.nextToken || null);
    } catch {
      setErrorText('Could not load more community worlds. Please try again.');
    } finally {
      setLoadingMoreGames(false);
    }
  }

  async function loadMyGames(reset = false) {
    if (!user && !reset) return;
    try {
      const params: Record<string, string | number> = { limit: 50 };
      if (!reset && myGamesNextToken) params.nextToken = myGamesNextToken;
      const result = await api.get('/api/my/games', { params });
      const incoming = Array.isArray(result.data?.games) ? result.data.games : [];
      setMyGames(current => {
        if (reset) return incoming;
        const unique = new Map(current.map(game => [game.id, game]));
        incoming.forEach((game: Game) => unique.set(game.id, game));
        return Array.from(unique.values());
      });
      setMyGamesNextToken(result.data.nextToken || null);
    } catch {
      setErrorText('Your creator submissions could not be refreshed. Please try again.');
    }
  }

  async function loadProfile() {
    try {
      const current = await auth.getUser();
      if (!current) {
        setUser(null);
        setProfile(null);
        return;
      }
      setUser({
        userId: current.userId,
        name: current.name,
        email: current.email,
      });
      const result = await api.get('/api/me');
      setProfile(result.data.profile);
      setProfileName(result.data.profile?.displayName || current.name || '');
      setProfileBio(result.data.profile?.bio || '');
      setPlusActive(result.data.profile?.plusActive === true);
      await checkAdminAccess();
    } catch {
      setErrorText('Signed-in profile could not load. Please try refreshing.');
    }
  }

  async function checkAdminAccess() {
    try {
      const [reports, privacy] = await Promise.all([api.get('/api/admin/reports'), api.get('/api/admin/privacy-requests')]);
      setAdminReports(Array.isArray(reports.data?.reports) ? reports.data.reports : []);
      setAdminPrivacyRequests(Array.isArray(privacy.data?.requests) ? privacy.data.requests : []);
      setIsAdmin(true);
    } catch {
      setAdminReports([]);
      setAdminPrivacyRequests([]);
      setIsAdmin(false);
    }
  }

  useEffect(() => {
    let live = true;
    (async () => {
      await loadGames();
      try {
        const current = await auth.getUser();
        if (live && current) {
          setUser({
            userId: current.userId,
            name: current.name,
            email: current.email,
          });
          const result = await api.get('/api/me');
          if (live) setProfile(result.data.profile);
          if (live) setProfileName(result.data.profile?.displayName || current.name || '');
          if (live) setProfileBio(result.data.profile?.bio || '');
          if (live) setPlusActive(result.data.profile?.plusActive === true);
          if (live) await checkAdminAccess();
          if (live) setGateStep(result.data.profile?.username ? 'home' : 'username');
        }
      } catch {
        if (live)
          setErrorText('Your profile could not load. Try signing in again.');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (page === 'studio' && user) void loadMyGames(true);
  }, [page, user]);

  const filtered = useMemo(
    () =>
      games.filter(
        g =>
          (genre === 'All' || g.genre === genre) &&
          (g.name + ' ' + g.genre + ' ' + g.creatorName + ' ' + g.description)
            .toLowerCase()
            .includes(query.toLowerCase())
      ),
    [games, genre, query]
  );

  async function signIn() {
    setSigningIn(true);
    setErrorText('');
    try {
      // Authentication completes by redirect. The startup getUser() flow restores
      // the session and loads the profile after the provider returns to this tab.
      await auth.signInWithRedirect();
    } catch (e) {
      const code = (e as { code?: string }).code;
      setErrorText(
        code === 'auth/storage-unavailable'
          ? 'Browser storage is blocked. Enable site data/cookies for Doria, then retry.'
          : code === 'auth/navigation-timeout'
            ? 'The sign-in page did not open. Please retry.'
            : 'Sign-in could not start. Please try again.'
      );
      setSigningIn(false);
    }
  }

  async function signOut() {
    try {
      await auth.signOut();
      setUser(null);
      setProfile(null);
      setIsAdmin(false);
      setAdminReports([]);
      setPage('discover');
      notify('Signed out. See you in Doria!');
    } catch {
      setErrorText('Could not sign out. Please try again.');
    }
  }

  async function createGame(event: React.FormEvent) {
    event.preventDefault();
    if (!user) {
      setModal(false);
      await signIn();
      return;
    }
    if (name.trim().length < 3) {
      setErrorText('Game names need at least 3 characters.');
      return;
    }
    setSaving(true);
    setErrorText('');
    try {
      let generatedHtml = htmlCode;
      if (creationMode === 'neo') {
        const neoResult = await api.post('/api/neo/generate', {
          gameName: name.trim(),
          genre: gameGenre,
          prompt: neoPrompt.trim(),
        });
        generatedHtml = neoResult.data.html;
        if (neoResult.data.usage) setAiUsage(neoResult.data.usage);
        else await loadAiUsage();
        if (typeof generatedHtml !== 'string' || generatedHtml.length < 100) {
          throw new Error('Neo returned an invalid game. Please try again.');
        }
      }
      const result = await api.post('/api/games', {
        name: name.trim(), genre: gameGenre, description: description.trim(), creationMode,
        htmlCode: creationMode === 'baseplate' ? '' : generatedHtml,
        neoPrompt: creationMode === 'neo' ? neoPrompt : '',
      });
      await loadMyGames(true);
      setName('');
      setDescription('');
      setModal(false);
      setPage('studio');
      notify('Your game is published and live on Doria!');
      await loadProfile();
    } catch (e) {
      if (creationMode === 'neo') await loadAiUsage();
      const status = (e as { response?: { status?: number } }).response?.status;
      const responseMessage = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      setErrorText(
        status === 401
          ? 'Please sign in to publish a game.'
          : responseMessage || (creationMode === 'neo' ? 'Neo could not finish this game. Please try again.' : 'Could not save your game. Please check the details and try again.')
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveUsername(event: React.FormEvent) {
    event.preventDefault();
    const clean = usernameInput.trim().replace(/^@/, '');
    setSaving(true); setErrorText('');
    try {
      const result = await api.post('/api/setup-username', { username: clean });
      setProfile(result.data.profile);
      setProfileName(result.data.profile?.displayName || clean);
      setGateStep('home');
      notify('Username reserved! Welcome to Doria, @' + clean + '.');
    } catch (e) {
      const status = (e as { response?: { status?: number } }).response?.status;
      setErrorText(status === 409 ? 'That username is already taken. Try another one.' : 'Choose a username with 3–20 letters, numbers or underscores.');
    } finally { setSaving(false); }
  }

  async function claimQuest() {
    if (!user) {
      await signIn();
      return;
    }
    setErrorText('');
    try {
      const result = await api.post('/api/rewards/idea-starter', {});
      setProfile(result.data.profile);
      notify(
        result.data.claimed
          ? 'Quest complete! +25 Starlits'
          : 'You already claimed this reward.'
      );
    } catch {
      setErrorText(
        'Could not claim the quest right now. Your balance has not been changed.'
      );
    }
  }

  useEffect(() => {
    if (!user) return;
    if (page === 'friends') {
      api.get('/api/friends').then(result => {
        setFriends(Array.isArray(result.data?.friends) ? result.data.friends : []);
        setIncomingFriendRequests(Array.isArray(result.data?.incomingRequests) ? result.data.incomingRequests : []);
        setOutgoingFriendRequests(Array.isArray(result.data?.outgoingRequests) ? result.data.outgoingRequests : []);
      }).catch(() => setFriendStatus('Could not load friends and requests.'));
      api.get('/api/blocks').then(result => setBlockedUsers(Array.isArray(result.data?.blockedUsers) ? result.data.blockedUsers : [])).catch(() => setBlockedUsers([]));
    }
    if (page === 'moments') api.get('/api/moments').then(result => setMoments(Array.isArray(result.data?.moments) ? result.data.moments : [])).catch(() => notify('Could not load video Moments.'));
    if (page === 'news') api.get('/api/news').then(result => setNewsPosts(Array.isArray(result.data?.posts) ? result.data.posts : [])).catch(() => notify('Could not load News.'));
    if (page === 'tasks') api.get('/api/tasks').then(result => setTasks(Array.isArray(result.data?.tasks) ? result.data.tasks : [])).catch(() => notify('Sign in to load Starlits quests.'));
    if (page === 'gamepasses') api.get('/api/gamepasses').then(result => { setGamepassCatalog(Array.isArray(result.data?.catalog) ? result.data.catalog : []); setPasses(Array.isArray(result.data?.owned) ? result.data.owned : []); }).catch(() => { setGamepassCatalog([]); setPasses([]); notify('Gamepasses could not be loaded. Please try again.'); });
  }, [page, user]);

  useEffect(() => {
    if (!user || page !== 'parental') return;
    let active = true;
    Promise.all([api.get('/api/parental/status'), api.get('/api/parental/guardian/children')])
      .then(([status, children]) => {
        if (!active) return;
        setParentalLinked(Boolean(status.data.linked));
        setParentSettings(status.data.settings || { friendRequests: true, moments: true, chat: false, dailyLimit: 90 });
        setGuardianChildren(children.data.children || []);
      })
      .catch((error: unknown) => active && setParentalError(getApiErrorMessage(error, 'Could not load parental controls.')));
    return () => { active = false; };
  }, [page, user]);

  const mine = myGames;
  const starlits = profile?.starlits ?? 250;

  async function loadAiUsage() {
    try {
      const result = await api.get('/api/ai/usage');
      setAiUsage(result.data.usage || null);
    } catch {
      setAiUsage(null);
    }
  }

  useEffect(() => {
    if (user) void loadAiUsage();
    else setAiUsage(null);
  }, [user]);

  function navButton(id: Page, label: string, icon: React.ReactNode) {
    return (
      <button
        key={id}
        type="button"
        className={page === id ? 'nav-item active' : 'nav-item'}
        aria-current={page === id ? 'page' : undefined}
        onClick={() => {
          setPage(id);
          setMobileNav(false);
        }}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  }

  async function toggleGameLike(game: Game) {
    if (!user) { await signIn(); return; }
    try { const result = await api.post('/api/games/' + encodeURIComponent(game.id) + '/like', {}); setLikedGames(current => result.data.liked ? [...new Set([...current, game.id])] : current.filter(id => id !== game.id)); setGameLikeCounts(current => ({...current,[game.id]:result.data.likes})); }
    catch { notify('Could not update like. Please try again.'); }
  }

  function gameCard(game: Game, index: number) {
    return (
      <article className="game-card" key={game.id}>
        <div className={'game-art ' + art[index % art.length]}>
          <img className="game-photo" src={gamePhotos[game.genre] || gamePhotos.Adventure} alt={game.name + ' game world thumbnail'} loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }} />
          <span className="art-tag">
            {'CREATOR WORLD'}
          </span>
        </div>
        <div className="game-info">
          <div className="game-heading">
            <div className="game-title-wrap">
              <h3>{game.name}</h3>
              <span className="creator">by {game.creatorName}</span>

            </div>
            <button className={'play-count like-count ' + (likedGames.includes(game.id) ? 'is-liked' : '')} onClick={() => void toggleGameLike(game)} aria-label={likedGames.includes(game.id) ? 'Unlike ' + game.name : 'Like ' + game.name}><Heart size={13} fill={likedGames.includes(game.id) ? 'currentColor' : 'none'} /> {formatCount(gameLikeCounts[game.id] ?? game.likes ?? 0)}</button>
          </div>
          <p className="game-desc">
            {game.description || 'A brand-new world waiting to be explored.'}
          </p>
          <div className="game-bottom">
            <span className="genre-label">{game.genre}</span>
            <div className="game-card-actions">
              <button className="pass-mini" onClick={() => setPage('gamepasses')} aria-label={'Gamepasses for ' + game.name}><LockKeyhole size={14} /></button>
              <button className="button-soft game-details-button" onClick={() => setDetailGame(game)}>Details</button>
              <button className="play-button" onClick={() => setActiveGame(game)}><Gamepad2 size={15} /> Play</button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  function discoverPage() {
    return (
      <>
        <section className="hero">
          <div className="hero-content">
            <span className="eyebrow">
              <Sparkles size={13} /> A universe made by you
            </span>
            <h1>
              Play beyond <span>ordinary.</span>
            </h1>
            <p>
              Explore games made by the community, or build and publish a world of your own.
            </p>
            <div className="hero-actions">
              <button
                className="button-primary"
                onClick={() => (user ? setPage('studio') : signIn())}
              >
                <WandSparkles size={17} /> Start creating
              </button>
              <button
                className="button-glass"
                onClick={() =>
                  document
                    .getElementById('worlds')
                    ?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                Explore worlds <ArrowDown size={15} />
              </button>
            </div>
          </div>
          <div className="hero-orb" aria-hidden="true"><Orbit size={76} strokeWidth={1.5} /></div>
        </section>
        <div className="section-head" id="worlds">
          <div>
            <h2>Explore community worlds</h2>
            <p>Games and worlds published by creators</p>
          </div>
          <button
            className="link-button"
            onClick={() => {
              setGenre('All');
              setQuery('');
            }}
          >
            View all <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="chips">
          {genres.map(g => (
            <button
              key={g}
              className={genre === g ? 'chip selected' : 'chip'}
              onClick={() => setGenre(g)}
            >
              {g}
            </button>
          ))}
        </div>
        {filtered.length ? (
          <div className="game-grid">{filtered.map(gameCard)}</div>
        ) : (
          <div className="empty-state">
            <Search size={32} />
            <h3>No worlds found</h3>
            <p>
              Try another search or category. Your next favourite might be one
              word away.
            </p>
            <button
              className="button-primary"
              onClick={() => {
                setGenre('All');
                setQuery('');
              }}
            >
              Clear filters
            </button>
          </div>
        )}
        {gamesNextToken && <div className="feed-load-more"><button className="button-secondary" onClick={() => void loadMoreGames()} disabled={loadingMoreGames}>{loadingMoreGames ? 'Loading worlds…' : 'Load more worlds'}</button></div>}
        <section className="doria-promotions" aria-label="Doria promotions">
          <article className="sponsored-strip">
            <div className="sponsored-tag">DORIA PROMOTION</div>
            <div className="sponsored-art"><WandSparkles size={30} /></div>
            <div className="sponsored-copy">
              <h3>Make something original</h3>
              <p>Turn your next game idea into a world with Doria Studio.</p>
              <small>Promoted by Doria · Not personalised</small>
            </div>
            <button className="button-glass" onClick={() => setPage('studio')}>
              Open Studio <ArrowUpRight size={14} />
            </button>
          </article>
          <article className="sponsored-strip">
            <div className="sponsored-tag">DORIA PROMOTION</div>
            <div className="sponsored-art moments-ad-art"><Video size={30} /></div>
            <div className="sponsored-copy">
              <h3>Share your creation</h3>
              <p>Show the community what you have been building in Doria Moments.</p>
              <small>Promoted by Doria · Not personalised</small>
            </div>
            <button className="button-glass" onClick={() => setPage('moments')}>
              Explore Moments <ArrowUpRight size={14} />
            </button>
          </article>
        </section>
        <div className="lower-grid">
          <section className="panel">
            <h3>
              <Sparkles size={17} /> A little creator quest
            </h3>
            <p className="panel-sub">
              Try a small challenge. No streaks, no pressure.
            </p>
            <div className="quest-row">
              <div className="quest-icon"><Lightbulb size={23} /></div>
              <div className="quest-copy">
                <b>Dream up a game idea</b>
                <small>Open Doria Studio and name your next world.</small>
                <div className="progress">
                  <span
                    style={{
                      width: profile?.trophies?.includes('idea-starter')
                        ? '100%'
                        : '45%',
                    }}
                  />
                </div>
              </div>
              <span className="reward">
                {profile?.trophies?.includes('idea-starter')
                  ? 'Done'
                  : '+25 Starlits'}
              </span>
            </div>
            <button className="button-soft" onClick={claimQuest}>
              {profile?.trophies?.includes('idea-starter')
                ? 'Quest completed'
                : 'Try this quest'}
            </button>
          </section>
          <section className="panel">
            <h3>
              <Trophy size={17} /> Trophies to chase
            </h3>
            <p className="panel-sub">
              Celebrate making, exploring, and helping.
            </p>
            <div className="trophy-row">
              <div className="trophy-tile">
                <span><Sprout size={22} /></span>
                <b>First Steps</b>
                <small>Start your journey</small>
              </div>
              <div className="trophy-tile">
                <span><Wrench size={22} /></span>
                <b>World Maker</b>
                <small>Create a game</small>
              </div>
              <div className="trophy-tile">
                <span><Star size={22} /></span>
                <b>Good Neighbour</b>
                <small>Help a creator</small>
              </div>
            </div>
          </section>
        </div>
      </>
    );
  }

  async function publishBaseplate(data: { name: string; genre: string; description: string; sceneData: Array<{kind:string;x:number;z:number;color:string}> }) {
    if (!user) { await signIn(); throw new Error('Sign in required'); }
    const result = await api.post('/api/games', { ...data, creationMode: 'baseplate', htmlCode: '' });
    await loadMyGames(true);
    notify('Your world is published and ready for everyone to play!');
    await loadProfile();
  }

  function studioPage() {
    return (
      <>
        <div className="page-intro">
          <span className="eyebrow">
            <WandSparkles size={13} /> Creator space
          </span>
          <h1>Doria Studio</h1>
          <p>Build, test and publish your own games.</p>
        </div>
        <section className="studio-banner">
          <div>
            <h2>
              Bring your <span>game idea to life.</span>
            </h2>
            <p>
              Choose a creation method, build your game and publish it for the community.
            </p>
            <button
              className="button-primary"
              onClick={() => (user ? setModal(true) : signIn())}
            >
              <Plus size={17} /> Create a game
            </button>
          </div>
          <div className="studio-art"><Gamepad2 size={76} strokeWidth={1.5} /></div>
        </section>
        <section className="studio-builder-section">
          <div className="section-head"><div><h2>Build a 3D world</h2><p>Place objects on the 3D baseplate, arrange your scene and publish it from Studio.</p></div></div>
          <BaseplateEditor onPublish={publishBaseplate} />
        </section>
        <CreatorGamepasses games={mine.map(game => ({ id: game.id, name: game.name }))} />
        <BadgeStudio games={mine.map(game => ({ id: game.id, name: game.name }))} />
        <div className="section-head">
          <div>
            <h2>Your creations</h2>
            <p>
              {user
                ? 'All your published worlds, ready for the community to discover.'
                : 'Sign in to save and manage your creations.'}
            </p>

          </div>
          {user && <button className="button-secondary" onClick={() => void loadMyGames(true)}>Refresh status</button>}
        </div>
        {user ? (
          mine.length ? (
            <div className="game-grid">{mine.map(gameCard)}</div>
          ) : (
            <div className="empty-state">
              <LayoutGrid size={34} />
              <h3>Your first world starts here</h3>
              <p>
                Create a game listing and let the community discover your idea.
              </p>
              <button className="button-primary" onClick={() => setModal(true)}>
                Create a game
              </button>
            </div>
          )
        ) : (
          <div className="empty-state">
            <LogIn size={34} />
            <h3>Sign in to create</h3>
            <p>
              Your published game listings will be linked to your Doria account.
            </p>
            <button className="button-primary" onClick={signIn}>
              Sign in to Doria
            </button>
          </div>
        )}
        {user && myGamesNextToken && <div className="feed-load-more"><button className="button-secondary" onClick={() => void loadMyGames(false)}>Load more creations</button></div>}
      </>
    );
  }

  function starlitsPage() {
    return (
      <>
        <div className="page-intro">
          <span className="eyebrow">
            <Coins size={13} /> Creator currency
          </span>
          <h1>Your Starlits</h1>
          <p>Earn Starlits through verified creator activities and community participation.</p>
        </div>
        <section className="starlit-banner">
          <div>
            <span className="eyebrow">
              YOUR BALANCE {user ? '· ACCOUNT' : '· PREVIEW'}
            </span>
            <h2>
              {starlits.toLocaleString()} <span>Starlits</span>
            </h2>
            <p>
              {user
                ? 'Your balance is saved with your account.'
                : 'Sign in to keep your reward progress across sessions.'}
            </p>
          </div>
          <div className="starlit-art"><Gem size={42} /></div>
        </section>
        <div className="section-head">
          <div>
            <h2>Ways to earn</h2>
            <p>Rewards for creativity, not compulsive play.</p>
          </div>
        </div>
        <div className="lower-grid">
          <section className="panel">
            <h3><Lightbulb size={17} /> Idea starter</h3>
            <p className="panel-sub">
              Claim a one-time reward for trying a creator quest.
            </p>
            <div className="quest-row">
              <div className="quest-icon"><Star size={22} /></div>
              <div className="quest-copy">
                <b>Dream up a game</b>
                <small>One-time reward per account</small>
              </div>
              <span className="reward">+25 Starlits</span>
            </div>
            <button className="button-primary full-button" onClick={claimQuest}>
              {profile?.trophies?.includes('idea-starter')
                ? 'Already claimed'
                : 'Claim reward'}
            </button>
          </section>
          <section className="panel">
            <h3>What Starlits could unlock</h3>
            <p className="panel-sub">
              Future possibilities — no purchase flow is active.
            </p>
            <div className="feature-row">
              <span><Palette size={22} /></span>
              <div>
                <b>Creator cosmetics</b>
                <small>Express your own style</small>
              </div>
            </div>
            <div className="feature-row">
              <span><Puzzle size={22} /></span>
              <div>
                <b>Studio extras</b>
                <small>More ways to make things</small>
              </div>
            </div>
          </section>
        </div>
        <p className="fine-print">
          Starlits in this early version are prototype points, not cash or a
          real-money currency.
        </p>
      </>
    );
  }

  function profilePage() {
    const savedName = profileName || profile?.displayName || user?.name || 'Doria Creator';
    const saveProfile = async () => {
      if (!user) {
        await signIn();
        return;
      }
      const displayName = (profileName || savedName).trim();
      const bio = profileBio.trim();
      if (displayName.length < 2 || displayName.length > 40 || bio.length > 220) {
        notify('Display name must be 2–40 characters and bio must be 220 characters or fewer.');
        return;
      }
      try {
        const result = await api.put('/api/profile', { displayName, bio });
        setProfile(result.data.profile);
        setProfileName(result.data.profile?.displayName || displayName);
        setProfileBio(result.data.profile?.bio || bio);
        notify('Your profile has been saved.');
      } catch {
        notify('Could not save your profile. Please try again.');
      }
    };
    return <>
      <div className="page-intro"><span className="eyebrow"><UserRound size={13}/> YOUR SPACE</span><h1>Profile</h1><p>Your creator identity, badges and about-me card.</p></div>
      <section className="profile-hero panel"><div className="profile-avatar">{savedName.slice(0,1).toUpperCase()}</div><div className="profile-hero-copy"><div className="profile-name-line"><h2>{savedName}</h2>{isAdmin && <span className="verified-admin-badge"><BadgeCheck size={15}/> Verified Administrator</span>}<span className="verified-badge"><Trophy size={15}/> {profile?.trophies?.length || 0} earned</span></div><p>{profileBio || 'Add a little about yourself so other creators can get to know you.'}</p><div className="profile-stats"><span><b>{mine.length}</b> Worlds</span><span><b>{friends.length}</b> Friends</span><span><b>{profile?.trophies?.length || 0}</b> Badges</span><span><b>{starlits}</b> Starlits</span></div></div></section>
      <div className="lower-grid"><section className="panel"><h3>Edit your profile</h3><label className="form-field">Display name<input value={profileName} maxLength={40} onChange={e => setProfileName(e.target.value)} placeholder={savedName}/></label><label className="form-field">About me<textarea value={profileBio} maxLength={220} onChange={e => setProfileBio(e.target.value)} placeholder="What do you like making or playing?"/></label><button className="button-primary full-button" onClick={saveProfile}><Check size={16}/> Save profile</button></section><section className="panel"><h3><BadgeCheck size={17}/> Earned badges</h3><div className="badge-collection">{trophyCatalog.filter(item => profile?.trophies?.includes(item.id)).map(item => <span key={item.id}>{trophyIcon(item.id)} <b>{item.title}</b></span>)}</div><p className="fine-print">Only achievements earned by this account appear here. Visit Trophies to see locked milestones.</p></section></div>
    </>;
  }

  function friendsPage() {
    async function refreshFriends() {
      const [result, blocks] = await Promise.all([api.get('/api/friends'), api.get('/api/blocks')]);
      setFriends(Array.isArray(result.data?.friends) ? result.data.friends : []);
      setIncomingFriendRequests(Array.isArray(result.data?.incomingRequests) ? result.data.incomingRequests : []);
      setOutgoingFriendRequests(Array.isArray(result.data?.outgoingRequests) ? result.data.outgoingRequests : []);
      setBlockedUsers(Array.isArray(blocks.data?.blockedUsers) ? blocks.data.blockedUsers : []);
    }
    async function blockPlayer(userId: string, username: string) {
      if (!window.confirm('Block @' + username + '? They will not be able to send friend requests or appear in your social feeds and chat.')) return;
      try {
        await api.post('/api/blocks', { userId });
        await refreshFriends();
        setFriendStatus('@' + username + ' is blocked.');
      } catch { setFriendStatus('Could not block this player. Please retry.'); }
    }
    async function unblockPlayer(userId: string) {
      try {
        await api.delete('/api/blocks/' + encodeURIComponent(userId));
        await refreshFriends();
        setFriendStatus('Player unblocked.');
      } catch { setFriendStatus('Could not unblock this player. Please retry.'); }
    }
    async function addFriend() {
      const username = friendInput.trim().replace(/^@/, '');
      if (!username) { setFriendStatus('Enter a username to search.'); return; }
      if (!user) { setFriendStatus('Sign in to send a friend request.'); return; }
      setFriendStatus('Looking up @' + username + '…');
      try {
        const result = await api.post('/api/friends', { username });
        if (result.data?.requested) {
          setFriendInput('');
          setFriendStatus('Friend request sent to @' + (result.data.request?.username || username) + '.');
          await refreshFriends();
        } else if (result.data?.friend?.username) {
          setFriendStatus('You are already friends with @' + result.data.friend.username + '.');
        } else {
          setFriendStatus(result.data?.message || 'A request is already pending.');
        }
      } catch (e) {
        const status = (e as { response?: { status?: number } }).response?.status;
        setFriendStatus(status === 404 ? 'User not found.' : status === 403 ? 'Friend requests are disabled by a guardian or the recipient.' : status === 409 ? 'They have already sent you a request. Check Incoming requests.' : status === 400 ? 'Check the username and try again.' : 'Could not send the friend request. Please retry.');
      }
    }
    async function respondToRequest(id: string, action: 'accept' | 'decline') {
      setFriendActionBusy(id);
      try {
        await api.put('/api/friend-requests/' + encodeURIComponent(id), { action });
        await refreshFriends();
        setFriendStatus(action === 'accept' ? 'Friend request accepted.' : 'Friend request declined.');
      } catch {
        setFriendStatus('That request could not be updated. Refresh and try again.');
      } finally {
        setFriendActionBusy('');
      }
    }
    return <><div className="page-intro"><span className="eyebrow"><Users size={13}/> YOUR CREW</span><h1>Friends</h1><p>Send a request and become friends only after the other player accepts.</p></div><section className="panel"><h3><UserPlus size={17}/> Find a friend</h3><div className="friend-add-row"><input value={friendInput} onChange={e => {setFriendInput(e.target.value);setFriendStatus('');}} maxLength={22} placeholder="Enter exact username" onKeyDown={e => { if (e.key === 'Enter') {e.preventDefault();void addFriend();} }}/><button className="button-primary" onClick={() => void addFriend()}><Search size={16}/> Send request</button></div>{friendStatus && <p className="panel-sub" role="status">{friendStatus}</p>}</section>
      <section className="panel"><h3>Incoming requests <span className="panel-sub">({incomingFriendRequests.length})</span></h3>{incomingFriendRequests.length ? <div className="friend-list">{incomingFriendRequests.map(request => <div className="friend-card" key={request.id}><span className="friend-avatar">{request.username.slice(0,1).toUpperCase()}</span><div><b>@{request.username}</b><small>Wants to connect with you</small></div><button className="button-primary" disabled={friendActionBusy === request.id} onClick={() => void respondToRequest(request.id, 'accept')}>Accept</button><button className="button-secondary" disabled={friendActionBusy === request.id} onClick={() => void respondToRequest(request.id, 'decline')}>Decline</button></div>)}</div> : <p className="panel-sub">No incoming requests.</p>}</section>
      <section className="panel"><h3>Outgoing requests <span className="panel-sub">({outgoingFriendRequests.length})</span></h3>{outgoingFriendRequests.length ? <div className="friend-list">{outgoingFriendRequests.map(request => <div className="friend-card" key={request.id}><span className="friend-avatar">{request.username.slice(0,1).toUpperCase()}</span><div><b>@{request.username}</b><small>Waiting for their response</small></div></div>)}</div> : <p className="panel-sub">No pending outgoing requests.</p>}</section>
      <div className="section-head"><div><h2>Your friends</h2><p>{friends.length} registered creator{friends.length === 1 ? '' : 's'}</p></div></div>{friends.length ? <div className="friend-list">{friends.map(friend => <div className="friend-card" key={friend.userId}><span className="friend-avatar">{friend.username.slice(0,1).toUpperCase()}</span><div><b>@{friend.username}</b><small>Connected Doria creator</small></div><button className="button-secondary" onClick={() => void blockPlayer(friend.userId, friend.username)}><Ban size={14}/> Block</button></div>)}</div> : <div className="empty-state"><Users size={30}/><h3>Your crew starts here</h3><p>Send a request and it will appear here after the other player accepts.</p></div>}
      <section className="panel"><h3>Blocked players <span className="panel-sub">({blockedUsers.length})</span></h3>{blockedUsers.length ? <div className="friend-list">{blockedUsers.map(item => <div className="friend-card" key={item.userId}><span className="friend-avatar"><Ban size={14}/></span><div><b>@{item.username}</b><small>Blocked from your account</small></div><button className="button-secondary" onClick={() => void unblockPlayer(item.userId)}>Unblock</button></div>)}</div> : <p className="panel-sub">You have not blocked anyone.</p>}</section></>;
  }

  async function reportContent(targetType: 'moment' | 'news' | 'game' | 'user' | 'chat', targetId: string) {
    try {
      await api.post('/api/reports', { targetType, targetId, reason: 'other', details: 'Reported from the Doria community feed.' });
      notify('Report sent to the moderation queue.');
    } catch (e) {
      const status = (e as { response?: { status?: number } }).response?.status;
      notify(status === 409 ? 'You already reported this item.' : status === 429 ? 'Daily report limit reached. Try again tomorrow.' : 'Report could not be submitted.');
    }
  }

  async function requestAccountDeletion() {
    if (!window.confirm('Send an account deletion request for manual review? Your account will not be deleted immediately.')) return;
    setPrivacyRequestBusy(true);
    try {
      const result = await api.post('/api/privacy/deletion-requests', {});
      notify(result.data?.message || 'Deletion request recorded for manual review.');
    } catch {
      notify('Could not record the request. Please use the privacy contact in the policy.');
    } finally {
      setPrivacyRequestBusy(false);
    }
  }

  function momentsPage() {
    async function addMoment() {
      if (!user) { await signIn(); return; }
      if (!momentVideoFile) { notify('Choose a video file first.'); return; }
      if (momentBusy) return;
      setMomentBusy(true);
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Video could not be read.'));
          reader.onerror = () => reject(new Error('Video could not be read.'));
          reader.readAsDataURL(momentVideoFile);
        });
        const videoBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const result = await api.post('/api/moments', { videoBase64, contentType: momentVideoFile.type, caption: momentCaption.trim() });
        setMoments(current => [result.data.moment, ...current]);
        URL.revokeObjectURL(momentVideoPreview);
        setMomentVideoFile(null);
        setMomentVideoPreview('');
        setMomentCaption('');
        notify('Video Moment published.');
      } catch (cause) {
        notify(cause instanceof Error ? cause.message : 'Video Moment could not be uploaded. Please try again.');
      } finally {
        setMomentBusy(false);
      }
    }
    function chooseMomentVideo(file?: File) {
      if (!file) return;
      if (!['video/mp4', 'video/webm', 'video/ogg'].includes(file.type)) { notify('Choose an MP4, WebM or OGG video.'); return; }
      if (file.size > 7 * 1024 * 1024) { notify('Videos must be 7 MB or smaller.'); return; }
      if (momentVideoPreview) URL.revokeObjectURL(momentVideoPreview);
      setMomentVideoFile(file);
      setMomentVideoPreview(URL.createObjectURL(file));
    }
    return <><div className="page-intro"><span className="eyebrow"><Video size={13}/> SHORT-FORM VIDEO FEED</span><h1>Doria Moments</h1><p>Upload a video file directly and share it with the community.</p></div><section className="moment-composer panel"><h3><Video size={17}/> Share a video Moment</h3><label className="moment-upload-picker"><Upload size={19}/><span>{momentVideoFile ? momentVideoFile.name : 'Choose a video to upload'}</span><small>MP4, WebM or OGG · Up to 7 MB</small><input type="file" accept="video/mp4,video/webm,video/ogg" onChange={event => chooseMomentVideo(event.target.files?.[0])}/></label>{momentVideoPreview && <div className="moment-upload-preview"><video className="moment-video" src={momentVideoPreview} controls playsInline preload="metadata"/><button type="button" className="button-secondary" onClick={() => { URL.revokeObjectURL(momentVideoPreview); setMomentVideoFile(null); setMomentVideoPreview(''); }}>Remove video</button></div>}<label className="form-field">Caption (optional)<textarea value={momentCaption} onChange={e => setMomentCaption(e.target.value)} maxLength={180} placeholder="Add a short caption…"/></label><div className="composer-bottom"><small>{momentCaption.length}/180 · Only upload videos you have permission to share.</small><button className="button-primary" disabled={!momentVideoFile || momentBusy} onClick={() => void addMoment()}>{momentBusy ? <><LoaderCircle size={15}/> Uploading…</> : <><Send size={15}/> Publish video</>}</button></div></section><div className="moments-feed">{moments.map(moment => <article className="moment-card panel" key={moment.id}><div className="moment-author"><span className="friend-avatar">{(moment.username || 'D').slice(0,1).toUpperCase()}</span><div><b>@{moment.username}</b><small>{new Date(moment.createdAt).toLocaleString()}</small></div><span className="moment-label">VIDEO MOMENT</span></div><video className="moment-video" src={moment.videoUrl} controls playsInline preload="metadata">Your browser cannot play this video.</video>{moment.caption && <p>{moment.caption}</p>}<div className="moment-footer"><span><Video size={15}/> Video Moment</span><span>Doria</span></div><div className="admin-report-actions"><button className="button-secondary" onClick={() => void reportContent('moment', moment.id)}><Flag size={13}/> Report</button>{moment.ownerId && moment.ownerId !== user?.userId && <button className="button-secondary" onClick={() => void api.post('/api/blocks', { userId: moment.ownerId }).then(() => notify('Creator blocked.')).catch(() => notify('Could not block creator.'))}><Ban size={13}/> Block creator</button>}</div></article>)}{moments.length === 0 && <div className="empty-state"><Video size={32}/><h3>No video Moments yet</h3><p>Published videos appear here for the community.</p></div>}</div></>;
  }

  function newsPage() {
    async function publishNews() { if (!user) { await signIn(); return; } const text = newsText.trim(); if (!text && !newsAttachment) return; try { const result = await api.post('/api/news', { text, attachments: newsAttachment ? [newsAttachment] : [] }); setNewsPosts(current => [result.data.post, ...current]); setNewsText(''); setNewsAttachment(null); notify('News post published.'); } catch { notify('Could not publish News post. Attachments must be under 300 KB each.'); } }
    return <><div className="page-intro"><span className="eyebrow"><Newspaper size={13}/> COMMUNITY UPDATES</span><h1>News</h1><p>Text updates, announcements, pictures and small files live here — separate from video Moments.</p></div><section className="panel"><h3>Publish a text update</h3><textarea value={newsText} onChange={e => setNewsText(e.target.value)} maxLength={500} placeholder="Share an update or announcement…"/><label className="news-attachment-picker"><Paperclip size={16}/> Attach a picture or file<input type="file" accept="image/*,.pdf,.txt,.doc,.docx" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(!['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain'].includes(file.type)){notify('Supported files: JPG, PNG, WebP, GIF, PDF and TXT.');e.currentTarget.value='';return;}if(file.size>50000){notify('Please choose a supported file smaller than 50 KB.');e.currentTarget.value='';return;}const reader=new FileReader();reader.onload=()=>setNewsAttachment({name:file.name,type:file.type||'application/octet-stream',dataUrl:String(reader.result||'')});reader.readAsDataURL(file);}}/></label>{newsAttachment && <div className="news-attachment-preview"><span>{newsAttachment.name}</span><button type="button" className="button-soft" onClick={()=>setNewsAttachment(null)}>Remove</button></div>}<div className="composer-bottom"><small>{newsText.length}/500 · {newsAttachment?'1 attachment selected':'No attachment selected'}</small><button className="button-primary" onClick={() => void publishNews()}><Send size={15}/> Publish to News</button></div></section><div className="moments-feed">{newsPosts.map(post => <article className="moment-card panel" key={post.id}><div className="moment-author"><span className="friend-avatar">{(post.username || 'D').slice(0,1).toUpperCase()}</span><div><b>@{post.username}</b><small>{new Date(post.createdAt).toLocaleString()}</small></div><span className="moment-label">NEWS</span></div>{post.text && <p>{post.text}</p>}{(post.attachments||[]).map(file=><div className="news-post-attachment" key={file.name}>{file.type.startsWith('image/')?<a href={file.dataUrl} target="_blank" rel="noreferrer"><img src={file.dataUrl} alt={file.name}/></a>:<a href={file.dataUrl} download={file.name}><Paperclip size={14}/> {file.name}</a>}</div>)}<div className="admin-report-actions"><button className="button-secondary" onClick={() => void reportContent('news', post.id)}><Flag size={13}/> Report</button>{post.ownerId && post.ownerId !== user?.userId && <button className="button-secondary" onClick={() => void api.post('/api/blocks', { userId: post.ownerId }).then(() => notify('Creator blocked.')).catch(() => notify('Could not block creator.'))}><Ban size={13}/> Block creator</button>}</div></article>)}{newsPosts.length === 0 && <div className="empty-state"><Newspaper size={30}/><h3>No News yet</h3><p>Community text posts will show up here.</p></div>}</div></>;
  }

  function tasksPage() {
    async function claimTask(id: string) {
      if (!user) { await signIn(); return; }
      try {
        const result = await api.post('/api/tasks/' + encodeURIComponent(id) + '/claim', {});
        if (result.data?.profile) setProfile(result.data.profile);
        setTasks(current => current.map(task => task.id === id ? { ...task, completed: true, canClaim: false } : task));
        notify(result.data?.claimed ? 'Quest complete! +' + result.data.reward + ' Starlits.' : 'This quest reward was already claimed.');
      } catch (error: unknown) { notify(getApiErrorMessage(error, 'Complete the quest requirements first.')); }
    }
    const earned = tasks.filter(task => task.completed).length;
    return <><div className="page-intro"><span className="eyebrow"><Coins size={13}/> PLAY · CREATE · EARN</span><h1>Starlits Quests</h1><p>Complete Doria activities to earn Starlits. These are reward missions, not personal to-do lists.</p></div><div className="starlit-banner pass-balance"><div><span className="eyebrow">YOUR BALANCE</span><h2>{starlits.toLocaleString()} <span>Starlits</span></h2><small>{earned} quests claimed today</small></div><Coins size={36}/></div><div className="task-list quest-list">{tasks.map(task => <article className="panel quest-card" key={task.id}><div className="quest-reward"><Coins size={17}/><b>+{task.reward}</b><small>Starlits</small></div><div className="quest-copy"><h3>{task.title}</h3><p>{task.detail}</p><small>{task.completed ? 'Reward claimed' : task.canClaim ? 'Ready to claim' : 'Complete the activity to unlock this reward'}</small></div><button className={task.completed ? 'button-soft owned-pass' : 'button-primary'} disabled={task.completed || !task.canClaim} onClick={() => void claimTask(task.id)}>{task.completed ? <><Check size={14}/> Claimed</> : 'Claim reward'}</button></article>)}{tasks.length === 0 && <div className="empty-state"><Coins size={30}/><h3>Quests are loading</h3><p>Sign in to see available Starlits rewards.</p></div>}</div><p className="fine-print">Quest eligibility and reward claims are checked by Doria's server. Each daily quest can only pay once per day.</p></>;
  }

  async function updateReportStatus(id: string, status: 'reviewing' | 'resolved' | 'dismissed') {
    setAdminBusy(id);
    try {
      const result = await api.put('/api/admin/reports/' + encodeURIComponent(id), { status });
      setAdminReports(current => current.map(report => report.id === id ? { ...report, ...result.data.report } : report));
      notify('Report status updated.');
    } catch {
      setErrorText('Could not update this report. Refresh the moderation queue and try again.');
    } finally {
      setAdminBusy('');
    }
  }

  async function removeReportedContent(type: string, contentId: string, reportId: string) {
    if (!window.confirm('Remove this reported content from Doria?')) return;
    setAdminBusy(reportId);
    try {
      await api.delete('/api/admin/content/' + encodeURIComponent(type) + '/' + encodeURIComponent(contentId));
      await api.put('/api/admin/reports/' + encodeURIComponent(reportId), { status: 'resolved' });
      setAdminReports(current => current.map(report => report.id === reportId ? { ...report, status: 'resolved' } : report));
      notify('Reported content removed.');
    } catch {
      setErrorText('Could not remove this content. It may already have been removed.');
    } finally {
      setAdminBusy('');
    }
  }

  async function updatePrivacyRequest(id: string, status: 'reviewing' | 'contacted') {
    setAdminBusy(id);
    try {
      const result = await api.put('/api/admin/privacy-requests/' + encodeURIComponent(id), { status });
      setAdminPrivacyRequests(current => current.map(item => item.id === id ? { ...item, ...result.data.request } : item));
      notify('Privacy request status updated.');
    } catch {
      setErrorText('Could not update this privacy request.');
    } finally {
      setAdminBusy('');
    }
  }

  function adminPage() {
    return <><div className="page-intro"><span className="eyebrow"><ShieldCheck size={13}/> RESTRICTED TO AUTHORIZED ADMINS</span><h1>Moderation queue</h1><p>Review community reports and record their current status. This console does not replace a staffed moderation team.</p></div><section className="panel"><div className="panel-heading"><h3>Community reports</h3><button className="button-secondary" onClick={() => void checkAdminAccess()}>Refresh</button></div>{adminReports.length === 0 ? <div className="empty-state"><ShieldCheck size={28}/><h3>No reports in the queue</h3><p>New community reports will appear here.</p></div> : <div className="admin-report-list">{adminReports.map(report => <article className="admin-report-row" key={report.id}><div><b>{report.targetType} · {report.reason}</b><p className="panel-sub">Target: {report.targetId}</p>{report.details && <p>{report.details}</p>}<small>{report.createdAt ? new Date(report.createdAt).toLocaleString() : 'Date unavailable'} · Status: {report.status}</small></div><div className="admin-report-actions"><button disabled={adminBusy === report.id} onClick={() => void updateReportStatus(report.id, 'reviewing')}>Reviewing</button><button disabled={adminBusy === report.id} onClick={() => void updateReportStatus(report.id, 'resolved')}>Resolve</button><button disabled={adminBusy === report.id} onClick={() => void updateReportStatus(report.id, 'dismissed')}>Dismiss</button>{['game','moment','news','chat'].includes(report.targetType) && <button disabled={adminBusy === report.id} onClick={() => void removeReportedContent(report.targetType, report.targetId, report.id)}><Trash2 size={13}/> Remove content</button>}</div></article>)}</div>}</section><section className="panel"><div className="panel-heading"><h3>Account deletion requests</h3><button className="button-secondary" onClick={() => void checkAdminAccess()}>Refresh</button></div>{adminPrivacyRequests.length ? <div className="admin-report-list">{adminPrivacyRequests.map(item => <article className="admin-report-row" key={item.id}><div><b>Account deletion request</b><p className="panel-sub">Account: {item.userId}</p><small>{new Date(item.createdAt).toLocaleString()} · Status: {item.status}</small></div><div className="admin-report-actions"><button disabled={adminBusy === item.id} onClick={() => void updatePrivacyRequest(item.id, 'reviewing')}>Reviewing</button><button disabled={adminBusy === item.id} onClick={() => void updatePrivacyRequest(item.id, 'contacted')}>Contacted</button></div></article>)}</div> : <p className="panel-sub">No account deletion requests are waiting.</p>}</section><p className="fine-print">Admin access is checked by the backend on every request. Deletion requests require manual handling through the approved account and data-deletion process; changing this queue status does not delete an account. Reports still require timely review by real people before public launch.</p></>;
  }

  function privacyPage() {
    return (
      <>
        <div className="page-intro">
          <span className="eyebrow"><FileText size={13} /> DORIA POLICIES</span>
          <h1>Privacy Policy</h1>
          <p>How Doria collects, uses and protects information across the platform.</p>
        </div>
        <section className="panel"><h3>Account deletion</h3><p className="panel-sub">You can submit a deletion request for manual review. This records your request but does not instantly erase your account or provider-held records.</p><button className="button-secondary" disabled={privacyRequestBusy || !user} onClick={() => void requestAccountDeletion()}><Trash2 size={15}/> {privacyRequestBusy ? 'Submitting…' : 'Request account deletion'}</button></section>
        <div className="privacy-draft-notice">
          <ShieldCheck size={18} />
          <div>
            <b>Privacy Policy · Version 1.0</b>
            <p>Effective date: 18 November 2026. Privacy requests can be sent to the contact address in Section 11. Provider disclosures reflect the reviewed Doria app source and may change as services evolve.</p>
          </div>
        </div>
        <div className="privacy-content">
          <section className="panel">
            <h2>1. Information we collect</h2>
            <p>Depending on how you use Doria, we process account identifiers and sign-in details supplied through the platform authentication service; usernames and profile details; games you create, play or like; progress, achievements, trophies and Starlits; friend connections; chat messages; reports; Moments captions and video links; guardian invitation email addresses and parental settings; and technical request information needed to operate and secure the service.</p>
            <p>Doria also stores some preferences and profile fields, such as display name, bio and theme, in your browser's local storage on that device. The reviewed app source does not request precise device location. Avoid publishing sensitive personal information.</p>
          </section>
          <section className="panel">
            <h2>2. How we use information</h2>
            <p>We use information to authenticate accounts, operate games and platform features, save progress and rewards, enable social features, process reports, provide moderation and safety tools, operate parental settings, prevent misuse, troubleshoot errors and maintain Doria.</p>
            <p>When a creator uses Neo AI, the submitted prompt and relevant generation request are sent to AppDeploy's AI service to produce the requested game content. Do not include passwords, private contact details or other sensitive information in prompts.</p>
          </section>
          <section className="panel">
            <h2>3. Friends, messages and Moments</h2>
            <p>Doria may process information shared through social features, including friend requests, chat messages, reports and Moments. Access to certain features may depend on parental-control settings.</p>
            <p>Users should avoid sharing home addresses, phone numbers, passwords, school details or other private information with strangers.</p>
          </section>
          <section className="panel">
            <h2>4. Parental controls and guardians</h2>
            <p>A player can invite a person using an email address. The invitation can be accepted only by a signed-in Doria account whose email matches the invited address. Linked accounts can use the guardian dashboard to manage available settings, including friend requests, Moments, chat permissions and daily playtime reminder preferences.</p>
            <p>Important limitation: matching an account email does not independently verify that the person is an adult or the player's parent or lawful guardian. This feature must not be treated as legally verifiable parental consent. Settings are enforced by the Doria backend for supported features. The daily playtime setting is a reminder threshold, not an automatic time limit.</p>
          </section>
          <section className="panel">
            <h2>5. Children's privacy</h2>
            <p>Doria is designed with younger users in mind. We aim to collect only information needed to operate the platform and provide its features. We encourage parents and guardians to help children understand online privacy and safe communication.</p>
            <p>If a parent or guardian believes a child has provided personal information inappropriately, they can contact Doria using the privacy contact details below.</p>
          </section>
          <section className="panel">
            <h2>6. Sharing information</h2>
            <p>Information is processed by the service providers described in Section 9 to host Doria, authenticate users, store app data, load fonts and images, and provide Neo AI generation. Information may also be accessed by authorised moderators when investigating reports, or disclosed where required by law or necessary to protect users and the service.</p>
            <p>The reviewed Doria source does not show an integrated advertising network or a dedicated analytics SDK. This source review cannot rule out technical logs or processing performed by hosting and infrastructure providers.</p>
          </section>
          <section className="panel">
            <h2>7. Data storage and security</h2>
            <p>We use technical and organisational measures intended to protect account information and platform data. However, no online service can guarantee absolute security. Users should protect their passwords and never share account credentials.</p>
          </section>
          <section className="panel">
            <h2>8. Data retention and deletion</h2>
            <p>We retain information only for as long as reasonably necessary to provide Doria, maintain security, resolve disputes and meet applicable legal obligations.</p>
            <p>Users or their guardians may request account deletion or removal of eligible personal information using the privacy contact details below. Some information may need to be retained where legally required or necessary for legitimate security purposes.</p>
          </section>
          <section className="panel">
            <h2>9. Third-party services</h2>
            <p>Doria currently uses or references the following external services in the reviewed app source:</p>
            <ul>
              <li><b>AppDeploy (FreeBraavos LTD):</b> app hosting and delivery, backend APIs, platform authentication/database capabilities and Neo AI generation. AppDeploy may use infrastructure and AI subprocessors described in its own policy and subprocessor list. <a href="https://appdeploy.ai/privacy" target="_blank" rel="noreferrer">AppDeploy Privacy Policy</a>.</li>
              <li><b>Google Fonts:</b> the app requests the Fredoka font stylesheet from Google Fonts. The browser may connect to Google to retrieve font resources. <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.</li>
              <li><b>Unsplash:</b> game artwork is loaded from Unsplash image URLs. When images load, the browser makes requests to Unsplash. <a href="https://unsplash.com/privacy" target="_blank" rel="noreferrer">Unsplash Privacy Policy</a>.</li>
            </ul>
            <p>These providers may receive ordinary technical information such as IP address, browser/device request details and timestamps when your device connects to their services. Provider terms and subprocessors may change; review the linked policies for their current practices.</p>
          </section>
          <section className="panel">
            <h2>10. Changes to this policy</h2>
            <p>We may update this Privacy Policy when Doria's features, services or legal obligations change. We will update the effective date when a new version is published. Significant changes should be communicated through an appropriate Doria channel.</p>
          </section>
          <section className="panel">
            <h2>11. Contact us</h2>
            <p><b>Platform:</b> Doria</p>
            <p><b>Privacy contact:</b> <a href="mailto:ritanshletsplayfootball@gmail.com">ritanshletsplayfootball@gmail.com</a></p>
            <p><b>Website:</b> https://doria-4bqrim.v2.appdeploy.ai/</p>
            <p>For privacy requests, account or data questions, or eligible deletion requests, email the address above. Please do not include passwords or sensitive personal information in your message.</p>
          </section>
        </div>
      </>
    );
  }

  function parentalPage() {
    const setSupervisedMultiplayer = async (childUserId: string, enabled: boolean) => {
      setParentalBusy(true); setParentalError(''); setParentalMessage('');
      try {
        await api.put('/api/parental/children/' + encodeURIComponent(childUserId) + '/multiplayer', { enabled });
        setGuardianChildren(current => current.map(child => child.childUserId === childUserId ? { ...child, multiplayerEnabled: enabled } : child));
        setParentalMessage(enabled ? 'Supervised multiplayer enabled.' : 'Multiplayer disabled.');
      } catch {
        setParentalError('Could not update supervised multiplayer. Refresh and retry.');
      } finally { setParentalBusy(false); }
    };
    const saveSetting = async (childUserId: string, key: string, value: boolean | number) => {
      setParentalBusy(true); setParentalError(''); setParentalMessage('');
      try {
        await api.put('/api/parental/children/' + encodeURIComponent(childUserId) + '/settings', { [key]: value });
        setGuardianChildren(current => current.map(child => child.childUserId === childUserId ? { ...child, [key]: value } : child));
        setParentalMessage('Guardian settings saved securely.');
      } catch (error: unknown) {
        setParentalError(getApiErrorMessage(error, 'Could not save guardian settings.'));
      } finally { setParentalBusy(false); }
    };
    const createInvite = async (event: React.FormEvent) => {
      event.preventDefault(); setParentalBusy(true); setParentalError(''); setParentalMessage(''); setGuardianMailto('');
      try {
        const result = await api.post('/api/parental/invitations', { email: guardianEmail });
        const link = window.location.origin + '/?guardian=' + encodeURIComponent(result.data.token);
        const subject = 'Doria parent/guardian invitation';
        const body = 'You have been invited to supervise a Doria account. Open this one-time link, sign in with ' + guardianEmail.trim() + ', and accept the invitation: ' + link + '\\n\\nThis link expires in 7 days and can only be used once.';
        setGuardianMailto('mailto:' + encodeURIComponent(guardianEmail.trim()) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body));
        setParentalMessage('Invitation created. Open your email app to send it to the guardian.');
      } catch (error: unknown) {
        setParentalError(getApiErrorMessage(error, 'Could not create the invitation.'));
      } finally { setParentalBusy(false); }
    };
    const acceptInvite = async () => {
      setParentalBusy(true); setParentalError(''); setParentalMessage('');
      try {
        await api.post('/api/parental/invitations/accept', { token: guardianToken });
        setParentalMessage('Guardian account linked successfully.');
        setGuardianToken('');
        window.history.replaceState({}, '', window.location.pathname);
        const children = await api.get('/api/parental/guardian/children');
        setGuardianChildren(children.data.children || []);
      } catch (error: unknown) {
        setParentalError(getApiErrorMessage(error, 'Could not accept this invitation. Sign in with the invited email.'));
      } finally { setParentalBusy(false); }
    };
    return <>
      <div className="page-intro"><span className="eyebrow"><Shield size={13}/> FAMILY SAFETY</span><h1>Parental Controls</h1><p>Guardian-linked safety settings, stored and enforced by Doria's backend.</p></div>
      {parentalError && <div className="notice" role="alert">{parentalError}</div>}
      {parentalMessage && <div className="notice" role="status">{parentalMessage}</div>}
      {guardianToken && <section className="panel parental-banner"><ShieldCheck size={25}/><div><h3>Accept guardian invitation</h3><p className="panel-sub">You're signed in as {user?.email || 'an account without an email address'}. To accept, this must match the email address the invitation was addressed to.</p><button className="button-primary" disabled={parentalBusy || !user?.email} onClick={() => void acceptInvite()}>{parentalBusy ? 'Verifying…' : 'Accept invitation'}</button></div></section>}
      {guardianChildren.length > 0 && <section className="panel parental-settings"><h2>Guardian dashboard</h2><p className="panel-sub">These controls apply to linked player accounts. Only the linked guardian can change them.</p>{guardianChildren.map(child => <div className="guardian-child" key={child.childUserId}><h3>Player account · {child.childUserId.slice(0, 8)}</h3><div className="setting-row"><span><b>Supervised multiplayer</b><small>This is a guardian approval setting, not identity or age verification.</small></span><button className={child.multiplayerEnabled ? 'button-soft' : 'button-primary'} disabled={parentalBusy} onClick={() => void setSupervisedMultiplayer(child.childUserId, !child.multiplayerEnabled)}>{child.multiplayerEnabled ? 'Disable multiplayer' : 'Enable multiplayer'}</button></div>{[['allowFriendRequests','Allow friend requests'],['allowMoments','Allow Doria Moments posting'],['allowChat','Allow game chat']].map(([key,label]) => <label className="setting-row" key={key}><span><b>{label}</b></span><input type="checkbox" checked={Boolean(child[key as keyof typeof child])} disabled={parentalBusy} onChange={event => void saveSetting(child.childUserId,key,event.target.checked)}/></label>)}<label className="setting-row"><span><b>Daily playtime reminder</b><small>Reminder only; this is not a forced lockout.</small></span><select value={child.dailyLimit} disabled={parentalBusy} onChange={event => void saveSetting(child.childUserId,'dailyLimit',Number(event.target.value))}><option value={30}>30 minutes</option><option value={60}>60 minutes</option><option value={90}>90 minutes</option><option value={120}>120 minutes</option></select></label></div>)}</section>}
      {!parentalLinked && guardianChildren.length === 0 && <section className="panel parental-settings"><h2>Link a parent or guardian</h2><p className="panel-sub">Enter their email. Doria creates a one-time invitation link that you can send using your email app. The guardian must open it and sign in with that same email address.</p><form onSubmit={createInvite}><label className="setting-row"><span><b>Guardian email</b></span><input type="email" required maxLength={254} value={guardianEmail} onChange={event => setGuardianEmail(event.target.value)} placeholder="parent@example.com"/></label><button className="button-primary" type="submit" disabled={parentalBusy || !guardianEmail.trim()}>{parentalBusy ? 'Creating invitation…' : 'Create email invitation'}</button></form>{guardianMailto && <p><a className="button-primary" href={guardianMailto}>Open email app to send invitation</a></p>}</section>}
      {parentalLinked && <section className="panel parental-banner"><ShieldCheck size={25}/><div><h3>Guardian linked</h3><p className="panel-sub">Your linked guardian manages these controls from their own Doria account. Changes are enforced by the backend.</p></div></section>}
      {import.meta.env.DEV && <section className="panel"><h3>Development-only test mode</h3><p className="panel-sub">This preview is local to a development build. It cannot create or bypass a production guardian relationship.</p><button className="button-soft" onClick={() => setParentalMessage('Development preview: production verification remains enabled.')}>Preview verification status</button></section>}
      <p className="fine-print">Invitation links expire after seven days and can be used once. The guardian must sign in with the invited email. Daily playtime is currently a reminder threshold, not an enforced session timer.</p>
    </>;
  }

  function gamepassesPage() {
    async function purchase(item: {id:string;gameId:string;name:string;price:number}) {
      if (!user) { await signIn(); return; }
      if (passes.includes(item.id)) { notify('You already own this gamepass.'); return; }
      try { const result = await api.post('/api/gamepasses/purchase', { passId: item.id, gameId: item.gameId }); setProfile(result.data.profile); setPasses(current => current.includes(item.id) ? current : [...current, item.id]); notify('Purchased ' + item.name + ' for ' + item.price + ' Starlits. Balance updated!'); }
      catch (e) { const status = (e as { response?: { status?: number } }).response?.status; notify(status === 400 ? 'Not enough Starlits for this pass.' : 'Purchase failed. Your balance was not deducted.'); }
    }
    return (
      <>
        <div className="page-intro">
          <span className="eyebrow"><LockKeyhole size={13}/> GAME EXTRAS</span>
          <h1>Gamepasses</h1>
          <p>Creator-published upgrades for specific games. Ownership and Starlits transactions are verified by Doria's server.</p>
        </div>
        <div className="starlit-banner pass-balance">
          <div>
            <span className="eyebrow">YOUR ACCOUNT BALANCE</span>
            <h2>{starlits.toLocaleString()} <span>Starlits</span></h2>
          </div>
          <Coins size={36}/>
        </div>
        {gamepassCatalog.length > 0 ? (
          <div className="gamepass-grid">
            {gamepassCatalog.map(item => (
              <article className="panel gamepass-card" key={item.id}>
                <div className="gamepass-art"><LockKeyhole size={28}/></div>
                <span className="genre-label">{item.game}</span>
                <h3>{item.name}</h3>
                <p className="panel-sub">{item.detail}</p>
                <div className="gamepass-bottom">
                  <span className="pass-price"><Coins size={14}/>{item.price} Starlits</span>
                  <button
                    className={passes.includes(item.id) ? 'button-soft owned-pass' : 'button-primary'}
                    disabled={passes.includes(item.id)}
                    onClick={() => void purchase(item)}
                  >
                    {passes.includes(item.id) ? <><Check size={14}/> Owned</> : 'Purchase'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <LockKeyhole size={30}/>
            <h3>No creator gamepasses yet</h3>
            <p>Game creators can publish upgrades from Doria Studio. Available passes will appear here with their game, price and effect details.</p>
          </div>
        )}
        <p className="fine-print">Purchases use virtual Starlits, not real money. Each pass is linked to one published game, and the server checks ownership, availability and balance before completing a purchase.</p>
      </>
    );
  }

  function trophiesPage() {
    const earnedIds = new Set(profile?.trophies || []);
    const earnedCount = trophyCatalog.filter(item => earnedIds.has(item.id)).length;
    return (
      <>
        <div className="page-intro">
          <span className="eyebrow"><Trophy size={13} /> Your milestones</span>
          <h1>Trophies &amp; Badges</h1>
          <p>Achievements are awarded to your account and stay with you across sessions.</p>
        </div>
        <section className="panel trophy-panel">
          <div className="section-head">
            <div><h3>Your collection</h3><p className="panel-sub">{earnedCount} of {trophyCatalog.length} achievements earned</p></div>
            <span className="reward">{earnedCount}/{trophyCatalog.length}</span>
          </div>
          <div className="trophy-row large-trophies trophy-grid">
            {trophyCatalog.map(item => {
              const unlocked = earnedIds.has(item.id);
              return (
                <article className={'trophy-tile ' + (unlocked ? 'unlocked' : 'locked')} key={item.id}>
                  <span>{unlocked ? trophyIcon(item.id) : <LockKeyhole size={22} />}</span>
                  <b>{item.title}</b>
                  <small>{unlocked ? 'Unlocked' : item.goal}</small>
                  <p>{item.detail}</p>
                </article>
              );
            })}
          </div>
        </section>
        <BadgeGallery />
        <section className="panel trophy-note">
          <ShieldCheck size={24} />
          <div>
            <h3>Play at your own pace</h3>
            <p className="panel-sub">Trophies celebrate creativity and progress — never punish players for taking a break.</p>
          </div>
        </section>
      </>
    );
  }

  function plusPage() {
    return (
      <>
        <section className="hero plus-hero">
          <div className="hero-content">
            <span className="eyebrow">
              <Crown size={13} /> CREATOR MEMBERSHIP
            </span>
            <h1>
              Doria <span>Plus.</span>
            </h1>
            <p>
              More creative power for builders: 1,000 AI credits each month, extra customisation and creator tools. Basic play and creativity stay welcoming to everyone.
            </p>
            <div className="plus-status" role="status">
              {plusActive ? <><Check size={17}/> Doria Plus enabled on this account</> : <><Crown size={17}/> Doria Plus is not enabled on this account</>}
            </div>
          </div>
          <div className="hero-orb"><Gem size={76} strokeWidth={1.5}/></div>
        </section>
        <section className="panel plus-theme-panel">
          <h3><Sparkles size={18}/> AI credit allowance</h3>
          <p className="panel-sub">Free accounts get 10 successful Neo prompts per day. Doria Plus accounts get 1,000 credits per month. Short game generation costs 10 credits, detailed generation 25, and highly detailed generation 30.</p>
          {aiUsage?.plan === 'plus' ? <div className="starlit-banner pass-balance"><div><span className="eyebrow">YOUR MONTHLY BALANCE</span><h2>{aiUsage.creditsRemaining?.toLocaleString()} <span>AI credits remaining</span></h2><p className="panel-sub">{aiUsage.creditsUsed?.toLocaleString()} of 1,000 used this month</p></div><Sparkles size={32}/></div> : <div className="starlit-banner pass-balance"><div><span className="eyebrow">YOUR DAILY BALANCE</span><h2>{aiUsage?.promptsRemaining ?? '—'} <span>free prompts remaining</span></h2><p className="panel-sub">{aiUsage?.promptsUsed ?? 0} of 10 used today</p></div><Sparkles size={32}/></div>}
          <p className="fine-print">Credits reset monthly. Failed Neo generations restore the reserved usage. Doria Plus is currently an account entitlement managed by Doria administrators; online subscription checkout is not enabled.</p>
        </section>
        <div className="game-grid plus-grid">
          <article className="panel plus-card">
            <span><Palette size={22} /></span>
            <h3>More customisation</h3>
            <p className="panel-sub">
              Extra profile and world styling options.
            </p>
          </article>
          <article className="panel plus-card">
            <span><Wrench size={22} /></span>
            <h3>Creator extras</h3>
            <p className="panel-sub">
              Optional tools to make building more expressive.
            </p>
          </article>
          <article className="panel plus-card">
            <span><Heart size={22} /></span>
            <h3>Community first</h3>
            <p className="panel-sub">
              A thoughtful model that respects creators and players.
            </p>
          </article>
        </div>
        <section className="panel plus-theme-panel">
          <h3><Palette size={18}/> Theme studio {plusActive ? <span className="plus-status">PLUS ACTIVE</span> : <span className="plus-status">PLUS FEATURE</span>}</h3>
          <p className="panel-sub">Choose a look for your Doria universe. Premium themes are available only when Doria Plus is enabled for your account by an authorised administrator.</p>
          <div className="theme-swatches">
            {[['midnight','Midnight','#171622'],['aurora','Aurora','#123d45'],['sunset','Sunset','#4a263c'],['mint','Mint','#163b30']].map(([id,label,color]) => <button key={id} className={'theme-swatch ' + (themeChoice === id ? 'chosen' : '')} onClick={() => { if (!plusActive) { notify('Activate Doria Plus to unlock themes.'); return; } setThemeChoice(id); }}><span style={{background:color}}/><b>{label}</b>{themeChoice === id && <Check size={14}/>}</button>)}
          </div>
        </section>
        <div className="lower-grid plus-grid">
          <article className="panel plus-card"><span><Palette size={22} /></span><h3>Profile themes</h3><p className="panel-sub">Personalise your profile and app colours.</p></article>
          <article className="panel plus-card"><span><Wrench size={22} /></span><h3>Creator extras</h3><p className="panel-sub">Optional Studio cosmetics and profile frames.</p></article>
          <article className="panel plus-card"><span><Heart size={22} /></span><h3>Community first</h3><p className="panel-sub">No payment flow is connected in this build.</p></article>
        </div>
        <div className="lower-grid plus-feature-grid"><section className="panel"><h3><Sparkles size={17}/> Doria Plus perks</h3><div className="feature-row"><Palette size={18}/><div><b>Extra avatar looks</b><small>Save colour and accessory presets</small></div></div><div className="feature-row"><WandSparkles size={18}/><div><b>Creator tools</b><small>Neo prompts and extra baseplate items</small></div></div><div className="feature-row"><Heart size={18}/><div><b>Creator analytics</b><small>Like and engagement summaries</small></div></div><div className="feature-row"><Rocket size={18}/><div><b>Plus profile themes</b><small>Unlock accent palettes and profile styling</small></div></div></section><section className="panel"><h3>Membership status</h3><p className="panel-sub">Doria Plus billing is not connected. Membership access is controlled by an authorised Doria administrator and verified by the backend.</p><button className="button-primary" onClick={()=>setPage('avatar')}><UserRound size={16}/> Open 3D Avatar Lab</button></section></div>
        <p className="fine-print">Doria Plus billing is not connected in this build. AI credits are enforced by the server; Plus entitlements must be enabled by an authorized Doria administrator.</p>
      </>
    );
  }

  if (gateStep !== 'home') {
    return (
      <div className="onboarding-shell">
        <div className="onboarding-glow onboarding-glow-one" />
        <div className="onboarding-glow onboarding-glow-two" />
        <section className="onboarding-card">
          <div className="onboarding-brand-mark"><DoriaLogo size={31}/></div>
          <div className="onboarding-wordmark">Doria <span>PLAY BEYOND</span></div>
          {gateStep === 'account' ? (
            <>
              <div className="onboarding-eyebrow"><Sparkles size={14} /> YOUR UNIVERSE STARTS HERE</div>
              <h1>Every world starts <span>with you.</span></h1>
              <p className="onboarding-copy">Sign in or create your Doria account to save your creator profile, collect Starlits and explore your universe. No external identity or age-verification provider is required.</p>
              {user ? (
                <button className="onboarding-primary" onClick={() => setGateStep(profile?.username ? 'home' : 'username')}>
                  Continue as {user.name || user.email || 'your account'} <ArrowUpRight size={17} />
                </button>
              ) : (
                <>
                  <button className="onboarding-primary" onClick={signIn} disabled={signingIn}>
                    {signingIn ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
                    Create account
                  </button>
                  <button className="onboarding-secondary" onClick={signIn} disabled={signingIn}>
                    <LogIn size={17} /> Sign in
                  </button>
                </>
              )}
              <div className="onboarding-safe-note"><ShieldCheck size={16} /> Account access is handled by Doria's sign-in provider.</div>
              {errorText && <p className="onboarding-error" role="alert">{errorText}</p>}
            </>
          ) : (
            <>
              <div className="onboarding-eyebrow"><UserRound size={14}/> CREATE YOUR DORIA ID</div>
              <h1>Choose your <span>username.</span></h1>
              <p className="onboarding-copy">Friends will find you using this unique username. Use 3–20 letters, numbers or underscores.</p>
              <form onSubmit={saveUsername} className="username-setup-form">
                <label className="form-field">Username
                  <input required minLength={3} maxLength={20} pattern="[A-Za-z0-9_]{3,20}" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} placeholder="e.g. starcreator7" autoCapitalize="none"/>
                </label>
                <button className="onboarding-primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17}/> : <Check size={17}/>} Save username & continue</button>
              </form>
              {errorText && <p className="onboarding-error" role="alert">{errorText}</p>}
              <button className="onboarding-text-button" onClick={signOut}>Sign out and switch account</button>
            </>
          )}
          <div className="onboarding-bottom"><span><DoriaLogo size={15}/> DORIA</span><span>Play beyond ordinary.</span></div>
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {mobileNav && <button type="button" className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <aside id="doria-sidebar" aria-label="Doria navigation" className={mobileNav ? 'sidebar mobile-open' : 'sidebar'}>
        <div className="brand">
          <div className="brand-mark"><DoriaLogo size={27}/></div>
          <div>
            Doria<small>PLAY BEYOND</small>
          </div>
          <button type="button" className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <div className="sidebar-nav-scroll">
          <section className="nav-group" aria-label="Explore">
            <div className="side-label">EXPLORE</div>
            <nav className="nav-list">
              {navButton('discover', 'Discover', <Compass size={19} />)}
              {navButton('moments', 'Doria Moments', <Video size={19} />)}
              {navButton('news', 'News', <Newspaper size={19} />)}
            </nav>
          </section>
          <section className="nav-group" aria-label="Create">
            <div className="side-label">CREATE</div>
            <nav className="nav-list">
              {navButton('studio', 'Doria Studio', <WandSparkles size={19} />)}
              {navButton('avatar', 'Avatar Studio', <Palette size={19} />)}
            </nav>
          </section>
          <section className="nav-group" aria-label="Community">
            <div className="side-label">COMMUNITY</div>
            <nav className="nav-list">
              {navButton('friends', 'Friends', <Users size={19} />)}
              {navButton('tasks', 'Tasks', <ListTodo size={19} />)}
              {navButton('starlits', 'Starlits', <Coins size={19} />)}
              {navButton('trophies', 'Badges', <Trophy size={19} />)}
            </nav>
          </section>
          <section className="nav-group" aria-label="Account">
            <div className="side-label">ACCOUNT</div>
            <nav className="nav-list">
              {navButton('profile', 'Profile', <UserRound size={19} />)}
              {navButton('plus', 'Doria Plus', <Crown size={19} />)}
              {navButton('parental', 'Parental Controls', <Shield size={19} />)}
              {navButton('privacy', 'Privacy Policy', <FileText size={19} />)}
              {isAdmin && navButton('admin', 'Moderation Queue', <ShieldCheck size={19} />)}
            </nav>
          </section>
        </div>
        <div className="sidebar-compact-footer">
          <div className="sidebar-foot">
            <ShieldCheck size={14} /> Reporting is available; active moderation is still required.
          </div>
          {installPrompt && <button type="button" className="install-app-button" onClick={() => void installPrompt()}><Download size={16}/> Install Doria</button>}
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu"
            onClick={() => setMobileNav(true)}
            aria-label="Open menu"
            aria-expanded={mobileNav}
            aria-controls="doria-sidebar"
          >
            <Menu size={21} />
          </button>
          <label className="search-box">
            <Search size={17} />
            <input
              aria-label="Search games and creators"
              placeholder="Search games, creators..."
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                if (page !== 'discover') setPage('discover');
              }}
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </label>
          <div className="top-actions">
            <button
              className="balance-pill"
              onClick={() => setPage('starlits')}
            >
              <Sparkles size={15} />
              {starlits.toLocaleString()}
            </button>
            {user ? (
              <button className="user-pill" onClick={signOut} title="Sign out">
                <span className="user-avatar">
                  {(user.name || user.email || 'D').charAt(0).toUpperCase()}
                </span>
                <span className="user-name">{user.name || 'Creator'}</span>
                <LogOut size={15} />
              </button>
            ) : (
              <button className="sign-in" onClick={signIn} disabled={signingIn}>
                {signingIn ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <LogIn size={15} />
                )}{' '}
                Sign in
              </button>
            )}
          </div>
        </header>
        {errorText && (
          <div className="notice" role="alert">
            <span>{errorText}</span>
            <button onClick={() => setErrorText('')} aria-label="Dismiss">
              <X size={15} />
            </button>
          </div>
        )}
        {loading && (
          <div className="loading-line">
            <LoaderCircle className="spin" size={16} /> Loading Doria…
          </div>
        )}
        {page === 'discover' && discoverPage()}
        {page === 'studio' && studioPage()}
        {page === 'starlits' && starlitsPage()}
        {page === 'trophies' && trophiesPage()}
        {page === 'plus' && plusPage()}
        {page === 'profile' && profilePage()}
        {page === 'avatar' && <><div className="page-intro"><span className="eyebrow"><UserRound size={13}/> YOUR CHARACTER</span><h1>Avatar Studio</h1><p>Customize your character and create, collect, and equip community-made accessories.</p></div><AvatarEditor /><AvatarMarketplace /></>}
        {page === 'friends' && friendsPage()}
        {page === 'moments' && momentsPage()}
        {page === 'news' && newsPage()}
        {page === 'tasks' && tasksPage()}
        {page === 'parental' && parentalPage()}
        {page === 'privacy' && privacyPage()}
        {page === 'admin' && isAdmin && adminPage()}
        {page === 'gamepasses' && gamepassesPage()}
        <footer className="footer">
          Doria · Play, create and share{' '}
          <span>
            Early access prototype ·{' '}
            <a
              href="#safety"
              onClick={e => {
                e.preventDefault();
                notify(
                  'Community reporting is available. A staffed moderation process is still required before public launch.'
                );
              }}
            >
              Safety first
            </a>
            {' · '}<a href="#privacy" onClick={e => { e.preventDefault(); setPage('privacy'); }}>Privacy Policy</a>
          </span>
        </footer>
      </main>
      {modal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setModal(false);
          }}
        >
          <form
            className="create-modal"
            onSubmit={createGame}
            aria-label="Create a game"
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">
                  <WandSparkles size={13} /> DORIA STUDIO
                </span>
                <h2>Create a world</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setModal(false)}
                aria-label="Close form"
              >
                <X size={19} />
              </button>
            </div>
            <p className="panel-sub">
              Add the details for your new game.
            </p>
            <label className="form-field">
              Game name
              <input
                autoFocus
                required
                minLength={3}
                maxLength={42}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Moonlight Mall"
              />
            </label>
            <label className="form-field">
              Genre
              <select
                value={gameGenre}
                onChange={e => setGameGenre(e.target.value)}
              >
                {genres
                  .filter(g => g !== 'All')
                  .map(g => (
                    <option key={g}>{g}</option>
                  ))}
              </select>
            </label>
            <div className="form-field"><span>How do you want to create it?</span><div className="creation-mode-options"><button type="button" className={creationMode==='html'?'mode-card selected':'mode-card'} onClick={()=>setCreationMode('html')}><b>Paste HTML</b><small>Paste HTML and run it in the sandboxed game frame.</small></button><button type="button" className={creationMode==='neo'?'mode-card selected':'mode-card'} onClick={()=>setCreationMode('neo')}><b>Neo Game Builder</b><small>Describe your idea and get a playable starting point.</small></button><button type="button" className={creationMode==='baseplate'?'mode-card selected':'mode-card'} onClick={()=>setCreationMode('baseplate')}><b>Start from Baseplate</b><small>Start with the Doria 3D Playground world.</small></button></div></div>
            {creationMode === 'html' && <label className="form-field">HTML code<textarea className="html-code-input" spellCheck={false} value={htmlCode} onChange={e=>setHtmlCode(e.target.value)} rows={7} placeholder="Paste HTML code here…"/><small>Runs inside a sandboxed frame with no access to your Doria account.</small></label>}
            {creationMode === 'neo' && <><label className="form-field">Tell Neo what to create<textarea value={neoPrompt} onChange={e=>setNeoPrompt(e.target.value)} maxLength={500} minLength={8} rows={3} placeholder="Describe the gameplay, goal, controls and style…"/></label><p className="neo-helper-note"><Sparkles size={14}/> Neo uses AI to turn your description into a playable HTML starting point. The game runs in an isolated sandbox. {aiUsage?.plan === 'plus' ? aiUsage.creditsRemaining + ' / 1,000 monthly credits remaining.' : aiUsage ? aiUsage.promptsRemaining + ' / 10 free creations remaining today.' : 'Your available usage is checked when you create.'}</p></>}
            {creationMode === 'baseplate' && <div className="baseplate-hint"><LayoutGrid size={18}/><span><b>Baseplate + Toolbox</b><small>Place blocks, trees, crystals, platforms and props on a 3D grid, then publish your saved scene.</small></span></div>}
            <label className="form-field">
              What's it about?
              <textarea
                maxLength={180}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe your world in one sentence…"
              />
            </label>
            {errorText && <p className="form-error">{errorText}</p>}
            <button className="button-primary full-button" disabled={saving}>
              {saving ? (
                <>
                  <LoaderCircle className="spin" size={16} /> {creationMode === 'neo' ? 'Creating your game…' : 'Saving…'}
                </>
              ) : (
                <>
                  {creationMode === 'neo' ? <><Sparkles size={17}/> Create game & publish</> : <><Plus size={17}/> Publish game</>}
                </>
              )}
            </button>
            <p className="modal-footnote">
              HTML and Neo games run in an isolated iframe. Baseplate worlds save their placed objects and open in Doria's 3D world viewer.
            </p>
          </form>
        </div>
      )}
      {activeGame && <ThreeGame gameId={activeGame.id} gameName={activeGame.name} genre={activeGame.genre} sceneData={activeGame.sceneData} creationMode={activeGame.creationMode} htmlCode={activeGame.htmlCode} onClose={() => setActiveGame(null)} />}
      {detailGame && <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setDetailGame(null);}}><section className="create-modal game-detail-modal"><div className="modal-head"><div><span className="eyebrow"><Gamepad2 size={13}/> GAME DETAILS</span><h2>{detailGame.name}</h2></div><button className="icon-button" onClick={()=>setDetailGame(null)} aria-label="Close details"><X size={18}/></button></div><div className={'game-art '+art[0]}><img className="game-photo" src={gamePhotos[detailGame.genre]||gamePhotos.Adventure} alt={detailGame.name}/></div><p>{detailGame.description || 'A Doria world ready to explore.'}</p><div className="game-detail-stats"><span><b>{detailGame.genre}</b><small>Genre</small></span><span><b>{formatCount(gameLikeCounts[detailGame.id] ?? detailGame.likes ?? 0)}</b><small>Likes</small></span><span><b>@{detailGame.creatorName}</b><small>Creator</small></span></div><div className="game-detail-actions"><button className="button-soft" onClick={()=>void toggleGameLike(detailGame)}><Heart size={15} fill={likedGames.includes(detailGame.id)?'currentColor':'none'}/>{likedGames.includes(detailGame.id)?'Liked':'Like game'}</button><button className="button-primary" onClick={()=>{setActiveGame(detailGame);setDetailGame(null);}}><Gamepad2 size={15}/> Play game</button></div></section></div>}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}

function formatCount(value: number) {
  if (value >= 1000)
    return (
      (value / 1000).toFixed(value >= 10000 ? 1 : 1).replace('.0', '') + 'K'
    );
  return String(value);
}

export default App;
