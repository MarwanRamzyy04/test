/**
 * ============================================================
 * SOUNDCLOUD CLONE — BACKEND UNIT TEST SUITE
 * Covers Phase 1: Modules 1–4
 * ============================================================
 */

'use strict';

// ─── Silence console noise during tests ─────────────────────
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

// ─── Shared test fixtures ────────────────────────────────────
const MOCK_USER_ID = 'user_abc123';
const MOCK_TRACK_ID = 'track_xyz789';

const mockUser = {
  _id: MOCK_USER_ID,
  email: 'testuser@example.com',
  displayName: 'Test User',
  permalink: 'test-user',
  role: 'Listener',
  isPremium: false,
  isEmailVerified: false,
  isPrivate: false,
  avatarUrl: 'default-avatar.png',
  coverUrl: 'default-cover.png',
  followerCount: 0,
  followingCount: 0,
  socialLinks: [],
  refreshToken: null,
  accountStatus: 'Active',
  matchPassword: jest.fn(),
  save: jest.fn().mockResolvedValue(true),
  toObject: jest.fn().mockReturnThis(),
};

const mockTrack = {
  _id: MOCK_TRACK_ID,
  title: 'My Test Track',
  permalink: 'my-test-track',
  artist: MOCK_USER_ID,
  format: 'audio/mpeg',
  size: 5_000_000,
  duration: 180,
  processingState: 'Finished',
  isPublic: true,
  artworkUrl: 'default-track-artwork.png',
  hlsUrl: 'https://azure.example.com/hls/playlist.m3u8',
  waveform: [10, 20, 30],
  playCount: 0,
  likeCount: 0,
  repostCount: 0,
  commentCount: 0,
  deleteOne: jest.fn().mockResolvedValue(true),
  save: jest.fn().mockResolvedValue(true),
};

// ╔══════════════════════════════════════════════════════════╗
// ║  MODULE 1 — AUTHENTICATION & USER MANAGEMENT            ║
// ╚══════════════════════════════════════════════════════════╝

describe('Module 1 — Authentication & User Management', () => {

  // ── 1.1  AppError utility ──────────────────────────────────
  describe('AppError', () => {
    const AppError = require('../src/utils/appError');

    test('sets statusCode, status = "fail" for 4xx', () => {
      const err = new AppError('Not found', 404);
      expect(err.statusCode).toBe(404);
      expect(err.status).toBe('fail');
      expect(err.isOperational).toBe(true);
      expect(err.message).toBe('Not found');
    });

    test('sets status = "error" for 5xx', () => {
      const err = new AppError('Server broke', 500);
      expect(err.status).toBe('error');
    });

    test('is an instance of Error', () => {
      expect(new AppError('x', 400)).toBeInstanceOf(Error);
    });

    test('captures a stack trace', () => {
      const err = new AppError('oops', 400);
      expect(err.stack).toBeDefined();
    });
  });

  // ── 1.2  catchAsync wrapper ────────────────────────────────
  describe('catchAsync', () => {
    const catchAsync = require('../src/utils/catchAsync');

    test('calls next(err) when the wrapped fn rejects', async () => {
      const boom = new Error('async boom');
      const handler = catchAsync(async () => { throw boom; });
      const next = jest.fn();
      await handler({}, {}, next);
      expect(next).toHaveBeenCalledWith(boom);
    });

    test('does NOT call next when the wrapped fn resolves', async () => {
      const handler = catchAsync(async (_req, res) => res.end());
      const next = jest.fn();
      const res = { end: jest.fn() };
      await handler({}, res, next);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ── 1.3  authService unit tests ───────────────────────────
  describe('authService', () => {

    jest.mock('../src/models/userModel');
    jest.mock('../src/utils/sendEmail', () => jest.fn().mockResolvedValue(true));
    jest.mock('axios');
    jest.mock('jsonwebtoken');
    jest.mock('google-auth-library');

    const User       = require('../src/models/userModel');
    const axios      = require('axios');
    const jwt        = require('jsonwebtoken');
    const authService = require('../src/services/authService');

    beforeEach(() => jest.clearAllMocks());

    test('generateTokens — returns token & refreshToken, saves user', async () => {
      jwt.sign = jest.fn()
        .mockReturnValueOnce('ACCESS_TOKEN')
        .mockReturnValueOnce('REFRESH_TOKEN');

      const user = { ...mockUser, save: jest.fn().mockResolvedValue(true) };
      const result = await authService.generateTokens(user);

      expect(result.token).toBe('ACCESS_TOKEN');
      expect(result.refreshToken).toBe('REFRESH_TOKEN');
      expect(user.save).toHaveBeenCalledTimes(1);
      expect(user.refreshToken).toBe('REFRESH_TOKEN');
    });

    test('loginUser — resolves with user on valid credentials', async () => {
      const userWithPw = { ...mockUser, matchPassword: jest.fn().mockResolvedValue(true) };
      User.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(userWithPw),
      });

      const result = await authService.loginUser('testuser@example.com', 'password123');
      expect(result).toEqual(userWithPw);
    });

    test('loginUser — throws AppError on wrong password', async () => {
      const userWithPw = { ...mockUser, matchPassword: jest.fn().mockResolvedValue(false) };
      User.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(userWithPw),
      });

      await expect(authService.loginUser('testuser@example.com', 'wrongpass'))
        .rejects.toMatchObject({ statusCode: 401 });
    });

    test('loginUser — throws AppError when user does not exist', async () => {
      User.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      await expect(authService.loginUser('ghost@example.com', 'pass'))
        .rejects.toMatchObject({ statusCode: 401 });
    });

    test('registerUser — throws when captchaToken is missing', async () => {
      await expect(
        authService.registerUser({ email: 'a@b.com', displayName: 'A' }, null)
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('registerUser — throws when CAPTCHA verification fails', async () => {
      axios.post = jest.fn().mockResolvedValue({ data: { success: false } });

      await expect(
        authService.registerUser({ email: 'a@b.com', displayName: 'A' }, 'bad-token')
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('registerUser — throws 409 when email already registered', async () => {
      axios.post = jest.fn().mockResolvedValue({ data: { success: true } });
      User.findOne = jest.fn().mockResolvedValue(mockUser);

      await expect(
        authService.registerUser({ email: 'testuser@example.com' }, 'good-token')
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    test('verifyEmail — marks email as verified and clears token', async () => {
      const user = {
        ...mockUser,
        isEmailVerified: false,
        emailVerificationToken: 'tok123',
        save: jest.fn().mockResolvedValue(true),
      };
      User.findOne = jest.fn().mockResolvedValue(user);

      const result = await authService.verifyEmail('tok123');

      expect(result.isEmailVerified).toBe(true);
      expect(result.emailVerificationToken).toBeUndefined();
      expect(user.save).toHaveBeenCalledTimes(1);
    });

    test('verifyEmail — throws 400 on invalid token', async () => {
      User.findOne = jest.fn().mockResolvedValue(null);

      await expect(authService.verifyEmail('bad-token'))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    test('logoutUser — clears refreshToken in DB', async () => {
      User.findByIdAndUpdate = jest.fn().mockResolvedValue(true);

      const result = await authService.logoutUser(MOCK_USER_ID);

      expect(result).toBe(true);
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        MOCK_USER_ID,
        { refreshToken: null }
      );
    });

    test('resetPassword — updates password and clears reset fields', async () => {
      const user = {
        ...mockUser,
        resetPasswordToken: 'valid-token',
        resetPasswordExpire: Date.now() + 600_000,
        save: jest.fn().mockResolvedValue(true),
      };
      User.findOne = jest.fn().mockResolvedValue(user);

      const result = await authService.resetPassword('valid-token', 'NewPass123!');

      expect(result.password).toBe('NewPass123!');
      expect(result.resetPasswordToken).toBeUndefined();
      expect(result.resetPasswordExpire).toBeUndefined();
    });

    test('resetPassword — throws 400 for expired token', async () => {
      User.findOne = jest.fn().mockResolvedValue(null);

      await expect(authService.resetPassword('expired-token', 'pass'))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    test('verifyRefreshToken — throws on mismatched stored token', async () => {
      jwt.verify = jest.fn().mockReturnValue({ id: MOCK_USER_ID });
      User.findById = jest.fn().mockResolvedValue({
        ...mockUser,
        refreshToken: 'different-token',
        save: jest.fn().mockResolvedValue(true),
      });

      await expect(authService.verifyRefreshToken('incoming-token'))
        .rejects.toThrow();
    });
  });

  // ── 1.4  authController tests ────────────────────────────
  describe('authController', () => {
    let ctrl;
    let authServiceMock;

    const mockRes = () => {
      const res = {};
      res.status      = jest.fn().mockReturnValue(res);
      res.json        = jest.fn().mockReturnValue(res);
      res.cookie      = jest.fn().mockReturnValue(res);
      res.clearCookie = jest.fn().mockReturnValue(res);
      res.redirect    = jest.fn().mockReturnValue(res);
      return res;
    };

    beforeEach(() => {
      jest.resetModules(); 

      authServiceMock = {
        loginUser: jest.fn(),
        generateTokens: jest.fn(),
        registerUser: jest.fn(),
        logoutUser: jest.fn(),
        generatePasswordReset: jest.fn(),
      };
      
      jest.doMock('../src/services/authService', () => authServiceMock);
      ctrl = require('../src/controllers/authController');
    });

    test('login — sets cookies and returns 200 on success', async () => {
      authServiceMock.loginUser.mockResolvedValue({
        _id: 'user_abc123', email: 'testuser@example.com',
        displayName: 'Test User', permalink: 'test-user',
        role: 'Listener', isPremium: false, isEmailVerified: false,
        followerCount: 0, followingCount: 0,
      });
      authServiceMock.generateTokens.mockResolvedValue({
        token: 'ACCESS', refreshToken: 'REFRESH',
      });

      const req  = { body: { email: 'testuser@example.com', password: 'pass' } };
      const res  = mockRes();
      const next = jest.fn();

      await ctrl.login(req, res, next);
      
      // FIX: Force the event loop to yield so 'catchAsync' inner promises complete
      await new Promise(resolve => setTimeout(resolve, 0)); 

      expect(next).not.toHaveBeenCalled();
      expect(res.cookie).toHaveBeenCalledWith('accessToken', 'ACCESS', expect.any(Object));
      expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'REFRESH', expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('login — calls next(400) when email or password is missing', async () => {
      const req  = { body: {} };
      const res  = mockRes();
      const next = jest.fn();

      await ctrl.login(req, res, next);
      await new Promise(resolve => setTimeout(resolve, 0)); 

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('register — returns 201 on success', async () => {
      authServiceMock.registerUser.mockResolvedValue({
        user: { _id: 'user_abc123', displayName: 'New User',
                email: 'new@example.com', permalink: 'new-user',
                role: 'Listener', isPremium: false,
                isEmailVerified: false, followerCount: 0, followingCount: 0 },
      });
      authServiceMock.generateTokens.mockResolvedValue({
        token: 'ACCESS', refreshToken: 'REFRESH'
      });

      const req = {
        body: { email: 'new@example.com', password: 'pass123',
                displayName: 'New User', captchaToken: 'tok' },
      };
      const res  = mockRes();
      const next = jest.fn();

      await ctrl.register(req, res, next);
      await new Promise(resolve => setTimeout(resolve, 0)); 

      expect(res.status).toHaveBeenCalledWith(201);
      expect(next).not.toHaveBeenCalled();
    });

    test('logout — clears both cookies and returns 200', async () => {
      authServiceMock.logoutUser.mockResolvedValue(true);

      const req  = { user: { _id: 'user_abc123' } };
      const res  = mockRes();
      const next = jest.fn();

      await ctrl.logout(req, res, next);
      await new Promise(resolve => setTimeout(resolve, 0)); 

      expect(res.clearCookie).toHaveBeenCalledWith('accessToken');
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('forgotPassword — calls next(400) when email is missing', async () => {
      const req  = { body: {} };
      const res  = mockRes();
      const next = jest.fn();

      await ctrl.forgotPassword(req, res, next);
      await new Promise(resolve => setTimeout(resolve, 0)); 

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });
  });

  // ── 1.5  authMiddleware (protect) ─────────────────────────
  describe('authMiddleware — protect', () => {
    jest.mock('../src/models/userModel');
    jest.mock('jsonwebtoken');

    const User  = require('../src/models/userModel');
    const jwt   = require('jsonwebtoken');
    const { protect } = require('../src/middlewares/authMiddleware');

    const next = jest.fn();
    const res  = {};

    beforeEach(() => jest.clearAllMocks());

    test('calls next(AppError 401) when no token is provided', async () => {
      await protect({ cookies: {}, headers: {} }, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    test('attaches user to req on valid Bearer token', async () => {
      jwt.verify    = jest.fn().mockReturnValue({ id: MOCK_USER_ID });
      User.findById = jest.fn().mockResolvedValue(mockUser);

      const req = {
        cookies: {},
        headers: { authorization: 'Bearer valid.jwt.token' },
      };

      await protect(req, res, next);

      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalledWith(/* no error */);
    });

    test('attaches user to req when token is in cookie', async () => {
      jwt.verify    = jest.fn().mockReturnValue({ id: MOCK_USER_ID });
      User.findById = jest.fn().mockResolvedValue(mockUser);

      const req = {
        cookies: { accessToken: 'cookie.jwt.token' },
        headers: {},
      };

      await protect(req, res, next);

      expect(req.user).toEqual(mockUser);
    });

    test('calls next(401) when user no longer exists in DB', async () => {
      jwt.verify    = jest.fn().mockReturnValue({ id: MOCK_USER_ID });
      User.findById = jest.fn().mockResolvedValue(null);

      const req = {
        cookies: {},
        headers: { authorization: 'Bearer token' },
      };

      await protect(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    test('calls next(401) when jwt.verify throws', async () => {
      jwt.verify = jest.fn().mockImplementation(() => { throw new Error('bad token'); });

      const req = {
        cookies: {},
        headers: { authorization: 'Bearer bad.token' },
      };

      await protect(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });
  });
});

// ╔══════════════════════════════════════════════════════════╗
// ║  MODULE 2 — USER PROFILE & SOCIAL IDENTITY              ║
// ╚══════════════════════════════════════════════════════════╝

describe('Module 2 — User Profile & Social Identity', () => {

  // ── 2.1  profileService unit tests ────────────────────────
  describe('profileService', () => {
    jest.mock('../src/models/userModel');
    jest.mock('../src/utils/azureStorage');

    const User                  = require('../src/models/userModel');
    const { uploadImageToAzure } = require('../src/utils/azureStorage');
    const profileService        = require('../src/services/profileService');

    beforeEach(() => jest.clearAllMocks());

    test('getProfileByPermalink — returns public profile', async () => {
      User.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ ...mockUser, isPrivate: false }),
      });

      const result = await profileService.getProfileByPermalink('test-user');
      expect(result.displayName).toBe('Test User');
    });

    test('getProfileByPermalink — returns restricted object for private profile', async () => {
      User.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ ...mockUser, isPrivate: true }),
      });

      const result = await profileService.getProfileByPermalink('test-user');
      expect(result.isPrivate).toBe(true);
      expect(result.bio).toBeUndefined();
    });

    test('getProfileByPermalink — throws 404 when not found', async () => {
      User.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      await expect(profileService.getProfileByPermalink('nobody'))
        .rejects.toMatchObject({ statusCode: 404 });
    });

    test('updatePrivacy — updates isPrivate field', async () => {
      User.findByIdAndUpdate = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ ...mockUser, isPrivate: true }),
      });

      const result = await profileService.updatePrivacy(MOCK_USER_ID, true);
      expect(result.isPrivate).toBe(true);
    });

    test('updatePrivacy — throws when user not found', async () => {
      User.findByIdAndUpdate = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      await expect(profileService.updatePrivacy(MOCK_USER_ID, true))
        .rejects.toThrow('User not found');
    });

    test('updateSocialLinks — persists new links', async () => {
      const links = [{ platform: 'instagram', url: 'https://ig.com/test' }];
      User.findByIdAndUpdate = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ ...mockUser, socialLinks: links }),
      });

      const result = await profileService.updateSocialLinks(MOCK_USER_ID, links);
      expect(result.socialLinks).toEqual(links);
    });

    test('removeSocialLink — removes link by id using $pull', async () => {
      User.findByIdAndUpdate = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ ...mockUser, socialLinks: [] }),
      });

      const result = await profileService.removeSocialLink(MOCK_USER_ID, 'link_id_1');
      expect(result.socialLinks).toHaveLength(0);
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        MOCK_USER_ID,
        { $pull: { socialLinks: { _id: 'link_id_1' } } },
        { new: true }
      );
    });

    test('updateTier — changes role to Artist', async () => {
      User.findByIdAndUpdate = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({ ...mockUser, role: 'Artist' }),
      });

      const result = await profileService.updateTier(MOCK_USER_ID, 'Artist');
      expect(result.role).toBe('Artist');
    });

    test('updateProfileData — only allows whitelisted fields', async () => {
      const updatedUser = { ...mockUser, bio: 'New bio', displayName: 'New Name' };
      User.findByIdAndUpdate = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(updatedUser),
      });

      const result = await profileService.updateProfileData(MOCK_USER_ID, {
        bio: 'New bio',
        displayName: 'New Name',
        password: 'HACKED',
      });

      const [, updateArg] = User.findByIdAndUpdate.mock.calls[0];
      expect(updateArg.$set).not.toHaveProperty('password');
      expect(result.bio).toBe('New bio');
    });

    test('updateProfileImages — uploads avatar and cover to Azure', async () => {
      uploadImageToAzure.mockResolvedValue('https://azure.example.com/avatar.jpg');
      User.findByIdAndUpdate = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          avatarUrl: 'https://azure.example.com/avatar.jpg',
          coverUrl:  'https://azure.example.com/cover.jpg',
        }),
      });

      const files = {
        avatar: [{ buffer: Buffer.from('img'), mimetype: 'image/jpeg' }],
        cover:  [{ buffer: Buffer.from('cov'), mimetype: 'image/jpeg' }],
      };

      const result = await profileService.updateProfileImages(MOCK_USER_ID, files);
      expect(result.avatarUrl).toContain('azure.example.com');
      expect(uploadImageToAzure).toHaveBeenCalledTimes(2);
    });

    test('updateProfileImages — throws when no valid image fields given', async () => {
      await expect(profileService.updateProfileImages(MOCK_USER_ID, {}))
        .rejects.toThrow('No valid image fields provided');
    });
  });

  // ── 2.2  profileController tests ─────────────────────────
  describe('profileController', () => {
    jest.mock('../src/services/profileService');

    const profileService    = require('../src/services/profileService');
    const profileController = require('../src/controllers/profileController');

    const mockRes = () => {
      const res = {};
      res.status = jest.fn().mockReturnValue(res);
      res.json   = jest.fn().mockReturnValue(res);
      return res;
    };

    beforeEach(() => jest.clearAllMocks());

    test('updatePrivacy — returns 200 with updated isPrivate', async () => {
      profileService.updatePrivacy = jest.fn().mockResolvedValue({ isPrivate: true });

      const req  = { user: { id: MOCK_USER_ID }, body: { isPrivate: true } };
      const res  = mockRes();
      const next = jest.fn();

      await profileController.updatePrivacy(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    test('updatePrivacy — calls next(400) when userId is missing', async () => {
      const req  = { user: {}, body: { isPrivate: true } };
      const res  = mockRes();
      const next = jest.fn();

      await profileController.updatePrivacy(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('uploadProfileImages — calls next(400) when no files uploaded', async () => {
      const req  = { user: { id: MOCK_USER_ID }, files: {} };
      const res  = mockRes();
      const next = jest.fn();

      await profileController.uploadProfileImages(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('getProfileByPermalink — returns 200 with user data', async () => {
      profileService.getProfileByPermalink = jest.fn().mockResolvedValue(mockUser);

      const req  = { params: { permalink: 'test-user' } };
      const res  = mockRes();
      const next = jest.fn();

      await profileController.getProfileByPermalink(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});

// ╔══════════════════════════════════════════════════════════╗
// ║  MODULE 3 — FOLLOWERS & SOCIAL GRAPH                    ║
// ╚══════════════════════════════════════════════════════════╝

describe('Module 3 — Followers & Social Graph', () => {

  // ── 3.1  networkService unit tests ───────────────────────
  describe('networkService', () => {
    jest.mock('../src/models/followModel');
    jest.mock('../src/models/blockModel');
    jest.mock('../src/models/userModel');
    jest.mock('../src/models/trackModel');

    const Follow         = require('../src/models/followModel');
    const Block          = require('../src/models/blockModel');
    const User           = require('../src/models/userModel');
    const Track          = require('../src/models/trackModel');
    const networkService = require('../src/services/networkService');

    const OTHER_USER_ID = 'user_other_456';

    beforeEach(() => jest.clearAllMocks());

    test('followUser — creates Follow doc and increments both counters', async () => {
      User.findById  = jest.fn().mockResolvedValue(mockUser);
      Follow.findOne = jest.fn().mockResolvedValue(null);
      Follow.create  = jest.fn().mockResolvedValue(true);

      User.findByIdAndUpdate = jest.fn()
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue({ followingCount: 1 }) })
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue({ followerCount: 1 }) });

      const result = await networkService.followUser(MOCK_USER_ID, OTHER_USER_ID);

      expect(Follow.create).toHaveBeenCalledTimes(1);
      expect(result).toHaveProperty('myFollowingCount', 1);
      expect(result).toHaveProperty('theirFollowerCount', 1);
    });

    test('followUser — throws when trying to follow yourself', async () => {
      await expect(networkService.followUser(MOCK_USER_ID, MOCK_USER_ID))
        .rejects.toThrow('You cannot follow yourself.');
    });

    test('followUser — throws when target user not found', async () => {
      User.findById = jest.fn().mockResolvedValue(null);

      await expect(networkService.followUser(MOCK_USER_ID, OTHER_USER_ID))
        .rejects.toThrow('User not found.');
    });

    test('followUser — throws when already following', async () => {
      User.findById  = jest.fn().mockResolvedValue(mockUser);
      Follow.findOne = jest.fn().mockResolvedValue({ _id: 'existing-follow' });

      await expect(networkService.followUser(MOCK_USER_ID, OTHER_USER_ID))
        .rejects.toThrow('You are already following this user.');
    });

    test('unfollowUser — deletes Follow doc and decrements both counters', async () => {
      Follow.findOneAndDelete = jest.fn().mockResolvedValue({ _id: 'follow-id' });

      User.findByIdAndUpdate = jest.fn()
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue({ followingCount: 0 }) })
        .mockReturnValueOnce({ select: jest.fn().mockResolvedValue({ followerCount: 0 }) });

      const result = await networkService.unfollowUser(MOCK_USER_ID, OTHER_USER_ID);

      expect(Follow.findOneAndDelete).toHaveBeenCalledTimes(1);
      expect(result.myFollowingCount).toBe(0);
    });

    test('unfollowUser — throws when not following target', async () => {
      Follow.findOneAndDelete = jest.fn().mockResolvedValue(null);

      await expect(networkService.unfollowUser(MOCK_USER_ID, OTHER_USER_ID))
        .rejects.toThrow('You are not following this user.');
    });

    test('getUserFeed — returns empty array when not following anyone', async () => {
      Follow.find = jest.fn().mockResolvedValue([]);

      const result = await networkService.getUserFeed(MOCK_USER_ID);
      expect(result).toEqual([]);
    });

    test('getUserFeed — returns tracks from followed artists (sorted newest first)', async () => {
      Follow.find = jest.fn().mockResolvedValue([{ following: OTHER_USER_ID }]);
      const fakeQuery = {
        populate: jest.fn().mockReturnThis(),
        select:   jest.fn().mockReturnThis(),
        sort:     jest.fn().mockReturnThis(),
        limit:    jest.fn().mockResolvedValue([mockTrack]),
      };
      Track.find = jest.fn().mockReturnValue(fakeQuery);

      const result = await networkService.getUserFeed(MOCK_USER_ID);
      expect(result).toContainEqual(mockTrack);
    });

    test('getFollowers — returns array of follower user objects', async () => {
      const fakeQuery = {
        populate: jest.fn().mockReturnThis(),
        skip:     jest.fn().mockReturnThis(),
        limit:    jest.fn().mockReturnThis(),
        sort:     jest.fn().mockResolvedValue([{ follower: mockUser }]),
      };
      Follow.find = jest.fn().mockReturnValue(fakeQuery);

      const result = await networkService.getFollowers(OTHER_USER_ID);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockUser);
    });

    test('getFollowing — returns array of following user objects', async () => {
      const fakeQuery = {
        populate: jest.fn().mockReturnThis(),
        skip:     jest.fn().mockReturnThis(),
        limit:    jest.fn().mockReturnThis(),
        sort:     jest.fn().mockResolvedValue([{ following: mockUser }]),
      };
      Follow.find = jest.fn().mockReturnValue(fakeQuery);

      const result = await networkService.getFollowing(MOCK_USER_ID);
      expect(result[0]).toEqual(mockUser);
    });

    test('blockUser — creates Block and removes existing Follow relationships', async () => {
      Block.findOne  = jest.fn().mockResolvedValue(null);
      Block.create   = jest.fn().mockResolvedValue(true);
      Follow.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });

      const result = await networkService.blockUser(MOCK_USER_ID, OTHER_USER_ID);
      expect(result.status).toBe('blocked');
      expect(Block.create).toHaveBeenCalledTimes(1);
      expect(Follow.deleteMany).toHaveBeenCalledTimes(1);
    });

    test('blockUser — throws 400 when blocking yourself', async () => {
      await expect(networkService.blockUser(MOCK_USER_ID, MOCK_USER_ID))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    test('blockUser — throws 409 when user already blocked', async () => {
      Block.findOne = jest.fn().mockResolvedValue({ _id: 'existing-block' });

      await expect(networkService.blockUser(MOCK_USER_ID, OTHER_USER_ID))
        .rejects.toMatchObject({ statusCode: 409 });
    });

    test('unblockUser — deletes the Block document', async () => {
      const fakeBlock = { _id: 'block-id' };
      Block.findOne         = jest.fn().mockResolvedValue(fakeBlock);
      Block.findByIdAndDelete = jest.fn().mockResolvedValue(true);

      const result = await networkService.unblockUser(MOCK_USER_ID, OTHER_USER_ID);
      expect(result.status).toBe('unblocked');
      expect(Block.findByIdAndDelete).toHaveBeenCalledWith('block-id');
    });

    test('unblockUser — throws 404 when user was not blocked', async () => {
      Block.findOne = jest.fn().mockResolvedValue(null);

      await expect(networkService.unblockUser(MOCK_USER_ID, OTHER_USER_ID))
        .rejects.toMatchObject({ statusCode: 404 });
    });

    test('getBlockedUsers — returns list of blocked user profiles', async () => {
      const fakeQuery = {
        populate: jest.fn().mockReturnThis(),
        sort:     jest.fn().mockResolvedValue([{ blocked: mockUser }]),
      };
      Block.find = jest.fn().mockReturnValue(fakeQuery);

      const result = await networkService.getBlockedUsers(MOCK_USER_ID);
      expect(result[0]).toEqual(mockUser);
    });
  });

  // ── 3.2  networkController tests ─────────────────────────
  describe('networkController', () => {
    jest.mock('../src/services/networkService');

    const networkService    = require('../src/services/networkService');
    const networkController = require('../src/controllers/networkController');

    const OTHER_USER_ID = 'user_other_456';

    const mockRes = () => {
      const res = {};
      res.status = jest.fn().mockReturnValue(res);
      res.json   = jest.fn().mockReturnValue(res);
      return res;
    };

    beforeEach(() => jest.clearAllMocks());

    test('followUser — returns 200 with updated counts', async () => {
      networkService.followUser = jest.fn().mockResolvedValue({
        myFollowingCount: 1,
        theirFollowerCount: 5,
      });

      const req = { user: { _id: MOCK_USER_ID }, params: { id: OTHER_USER_ID } };
      const res = mockRes();
      await networkController.followUser(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    test('unfollowUser — returns 200 with updated counts', async () => {
      networkService.unfollowUser = jest.fn().mockResolvedValue({
        myFollowingCount: 0,
        theirFollowerCount: 4,
      });

      const req = { user: { _id: MOCK_USER_ID }, params: { id: OTHER_USER_ID } };
      const res = mockRes();
      await networkController.unfollowUser(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('getFeed — returns track list with count', async () => {
      networkService.getUserFeed = jest.fn().mockResolvedValue([mockTrack]);

      const req = { user: { _id: MOCK_USER_ID } };
      const res = mockRes();
      await networkController.getFeed(req, res, jest.fn());

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ count: 1 })
      );
    });

    test('blockUser — returns 200 with blocked status', async () => {
      networkService.blockUser = jest.fn().mockResolvedValue({ status: 'blocked' });

      const req = { user: { id: MOCK_USER_ID }, params: { userId: OTHER_USER_ID } };
      const res = mockRes();
      await networkController.blockUser(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('getSuggestedUsers — returns suggested list', async () => {
      networkService.getSuggestedUsers = jest.fn().mockResolvedValue([mockUser]);

      const req = {
        user: { id: MOCK_USER_ID },
        query: { page: '1', limit: '10' },
      };
      const res = mockRes();
      await networkController.getSuggestedUsers(req, res, jest.fn());

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ count: 1 })
      );
    });
  });
});

// ╔══════════════════════════════════════════════════════════╗
// ║  MODULE 4 — AUDIO UPLOAD & TRACK MANAGEMENT             ║
// ╚══════════════════════════════════════════════════════════╝

describe('Module 4 — Audio Upload & Track Management', () => {

  // ── 4.1  trackService unit tests ─────────────────────────
  describe('trackService', () => {
    jest.mock('../src/models/trackModel');
    jest.mock('../src/utils/azureStorage');
    jest.mock('../src/utils/queueProducer');

    process.env.AZURE_ACCOUNT_NAME   = 'fakeaccount';
    process.env.AZURE_ACCOUNT_KEY    = Buffer.alloc(32).toString('base64');
    process.env.AZURE_CONTAINER_NAME = 'biobeats-audio';
    process.env.AZURE_STORAGE_CONNECTION_STRING =
      'DefaultEndpointsProtocol=https;AccountName=fakeaccount;AccountKey=' +
      Buffer.alloc(32).toString('base64') +
      ';EndpointSuffix=core.windows.net';

    const Track                      = require('../src/models/trackModel');
    const { publishToQueue }          = require('../src/utils/queueProducer');
    const { uploadImageToAzure }      = require('../src/utils/azureStorage');
    const trackService               = require('../src/services/trackService');

    beforeEach(() => jest.clearAllMocks());

    test('updateTrackMetadata — updates allowed fields only', async () => {
      const updated = { ...mockTrack, title: 'New Title', genre: 'Hip-Hop' };
      Track.findOneAndUpdate = jest.fn().mockResolvedValue(updated);

      const result = await trackService.updateTrackMetadata(
        MOCK_TRACK_ID, MOCK_USER_ID,
        { title: 'New Title', genre: 'Hip-Hop', audioUrl: 'HACKED' }
      );

      expect(result.title).toBe('New Title');
      const [, updateArg] = Track.findOneAndUpdate.mock.calls[0];
      expect(updateArg.$set).not.toHaveProperty('audioUrl');
    });

    test('updateTrackMetadata — throws 404 when track not found or not owned', async () => {
      Track.findOneAndUpdate = jest.fn().mockResolvedValue(null);

      await expect(
        trackService.updateTrackMetadata(MOCK_TRACK_ID, MOCK_USER_ID, { title: 'x' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    test('toggleTrackVisibility — flips isPublic to false', async () => {
      const track = { ...mockTrack, isPublic: true, save: jest.fn().mockResolvedValue(true) };
      Track.findById = jest.fn().mockResolvedValue(track);

      const result = await trackService.toggleTrackVisibility(MOCK_TRACK_ID, MOCK_USER_ID, false);

      expect(result.isPublic).toBe(false);
      expect(track.save).toHaveBeenCalledTimes(1);
    });

    test('toggleTrackVisibility — throws 404 when track does not exist', async () => {
      Track.findById = jest.fn().mockResolvedValue(null);

      await expect(
        trackService.toggleTrackVisibility(MOCK_TRACK_ID, MOCK_USER_ID, true)
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    test('toggleTrackVisibility — throws 403 when caller is not the artist', async () => {
      Track.findById = jest.fn().mockResolvedValue({ ...mockTrack, artist: 'someone_else' });

      await expect(
        trackService.toggleTrackVisibility(MOCK_TRACK_ID, MOCK_USER_ID, true)
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    test('generateUploadUrl — throws 403 when free user hits 3-track limit', async () => {
      Track.countDocuments = jest.fn().mockResolvedValue(3);

      await expect(
        trackService.generateUploadUrl(
          { ...mockUser, isPremium: false },
          { title: 'Track 4', format: 'audio/mpeg', size: 1000, duration: 60 }
        )
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    test('generateUploadUrl — throws 400 for unsupported audio format', async () => {
      Track.countDocuments = jest.fn().mockResolvedValue(0);

      await expect(
        trackService.generateUploadUrl(
          { ...mockUser, isPremium: false },
          { title: 'Track', format: 'audio/ogg', size: 1000, duration: 60 }
        )
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('generateUploadUrl — returns trackId and uploadUrl for valid upload', async () => {
      Track.countDocuments = jest.fn().mockResolvedValue(0);
      Track.create         = jest.fn().mockResolvedValue({ _id: MOCK_TRACK_ID });

      const result = await trackService.generateUploadUrl(
        { ...mockUser, _id: MOCK_USER_ID, isPremium: false },
        { title: 'My Track', format: 'audio/mpeg', size: 5_000_000, duration: 180 }
      );

      expect(result).toHaveProperty('trackId');
      expect(result).toHaveProperty('uploadUrl');
    });

    test('generateUploadUrl — premium user bypasses track limit', async () => {
      Track.countDocuments = jest.fn().mockResolvedValue(100);
      Track.create         = jest.fn().mockResolvedValue({ _id: MOCK_TRACK_ID });

      const result = await trackService.generateUploadUrl(
        { ...mockUser, _id: MOCK_USER_ID, isPremium: true },
        { title: 'Premium Track', format: 'audio/wav', size: 50_000_000, duration: 300 }
      );

      expect(Track.countDocuments).not.toHaveBeenCalled();
      expect(result).toHaveProperty('trackId');
    });

    test('confirmUpload — sets processingState to Processing and publishes queue message', async () => {
      const track = {
        ...mockTrack,
        processingState: 'Processing',
        _id: { toString: () => MOCK_TRACK_ID },
        save: jest.fn().mockResolvedValue(true),
      };
      Track.findOne    = jest.fn().mockResolvedValue(track);
      publishToQueue.mockResolvedValue(true);

      const result = await trackService.confirmUpload(MOCK_TRACK_ID, MOCK_USER_ID);

      expect(track.save).toHaveBeenCalledTimes(1);
      expect(publishToQueue).toHaveBeenCalledWith(
        'audio_processing_queue',
        expect.objectContaining({ trackId: MOCK_TRACK_ID })
      );
      expect(result.processingState).toBe('Processing');
    });

    test('confirmUpload — throws 404 when track not found', async () => {
      Track.findOne = jest.fn().mockResolvedValue(null);

      await expect(trackService.confirmUpload(MOCK_TRACK_ID, MOCK_USER_ID))
        .rejects.toMatchObject({ statusCode: 404 });
    });

    test('getTrackByPermalink — returns track for finished, public track', async () => {
      const fakeQuery = {
        select:   jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(mockTrack),
      };
      Track.findOne = jest.fn().mockReturnValue(fakeQuery);

      const result = await trackService.getTrackByPermalink('my-test-track');
      expect(result).toEqual(mockTrack);
    });

    test('getTrackByPermalink — throws when track is still processing', async () => {
      const fakeQuery = {
        select:   jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue({ ...mockTrack, processingState: 'Processing' }),
      };
      Track.findOne = jest.fn().mockReturnValue(fakeQuery);

      await expect(trackService.getTrackByPermalink('my-test-track'))
        .rejects.toThrow('Track not found or is still processing.');
    });

    test('getTrackByPermalink — throws when track not found', async () => {
      const fakeQuery = {
        select:   jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(null),
      };
      Track.findOne = jest.fn().mockReturnValue(fakeQuery);

      await expect(trackService.getTrackByPermalink('nonexistent'))
        .rejects.toThrow();
    });

    test('deleteTrack — deletes blob from Azure and removes DB record', async () => {
      Track.findById = jest.fn().mockResolvedValue({
        ...mockTrack,
        deleteOne: jest.fn().mockResolvedValue(true),
      });

      const result = await trackService.deleteTrack(MOCK_TRACK_ID, MOCK_USER_ID);
      expect(result).toBe(true);
    });

    test('deleteTrack — throws 404 when track not found', async () => {
      Track.findById = jest.fn().mockResolvedValue(null);

      await expect(trackService.deleteTrack(MOCK_TRACK_ID, MOCK_USER_ID))
        .rejects.toMatchObject({ statusCode: 404 });
    });

    test('deleteTrack — throws 403 when caller is not the owner', async () => {
      Track.findById = jest.fn().mockResolvedValue({ ...mockTrack, artist: 'someone_else' });

      await expect(trackService.deleteTrack(MOCK_TRACK_ID, MOCK_USER_ID))
        .rejects.toMatchObject({ statusCode: 403 });
    });

    test('downloadTrackAudio — throws 403 for non-premium user', async () => {
      await expect(
        trackService.downloadTrackAudio(MOCK_TRACK_ID, { isPremium: false })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    test('downloadTrackAudio — throws 404 when track not finished', async () => {
      Track.findById = jest.fn().mockResolvedValue({
        ...mockTrack,
        processingState: 'Processing',
      });

      await expect(
        trackService.downloadTrackAudio(MOCK_TRACK_ID, { isPremium: true })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    test('updateTrackArtwork — throws 404 when track not found', async () => {
      Track.findById = jest.fn().mockResolvedValue(null);

      await expect(
        trackService.updateTrackArtwork(MOCK_TRACK_ID, MOCK_USER_ID, {
          buffer: Buffer.from('img'),
          originalname: 'art.jpg',
        })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    test('updateTrackArtwork — throws 403 when caller is not the artist', async () => {
      Track.findById = jest.fn().mockResolvedValue({ ...mockTrack, artist: 'someone_else' });

      await expect(
        trackService.updateTrackArtwork(MOCK_TRACK_ID, MOCK_USER_ID, {
          buffer: Buffer.from('img'),
          originalname: 'art.jpg',
        })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    test('updateTrackArtwork — uploads image and updates artworkUrl', async () => {
      uploadImageToAzure.mockResolvedValue('https://azure.example.com/art.jpg');
      const track = { ...mockTrack, save: jest.fn().mockResolvedValue(true) };
      Track.findById = jest.fn().mockResolvedValue(track);

      const result = await trackService.updateTrackArtwork(
        MOCK_TRACK_ID, MOCK_USER_ID,
        { buffer: Buffer.from('img'), originalname: 'art.jpg' }
      );

      expect(result.artworkUrl).toBe('https://azure.example.com/art.jpg');
      expect(track.save).toHaveBeenCalledTimes(1);
    });
  });

  // ── 4.2  trackController tests ───────────────────────────
  describe('trackController', () => {
    jest.mock('../src/services/trackService');

    const trackService    = require('../src/services/trackService');
    const trackController = require('../src/controllers/trackController');

    const mockRes = () => {
      const res = {};
      res.status    = jest.fn().mockReturnValue(res);
      res.json      = jest.fn().mockReturnValue(res);
      res.setHeader = jest.fn();
      return res;
    };

    beforeEach(() => jest.clearAllMocks());

    test('updateVisibility — returns 400 when isPublic is not boolean', async () => {
      const req = {
        params: { id: MOCK_TRACK_ID },
        user:   { _id: MOCK_USER_ID },
        body:   { isPublic: 'yes' },
      };
      const res  = mockRes();
      const next = jest.fn();

      await trackController.updateVisibility(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('updateVisibility — returns 200 when isPublic is valid boolean', async () => {
      trackService.toggleTrackVisibility = jest.fn().mockResolvedValue({
        ...mockTrack, isPublic: false,
      });

      const req = {
        params: { id: MOCK_TRACK_ID },
        user:   { _id: MOCK_USER_ID },
        body:   { isPublic: false },
      };
      const res = mockRes();

      await trackController.updateVisibility(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('uploadArtwork — calls next(400) when no file provided', async () => {
      const req = {
        params: { id: MOCK_TRACK_ID },
        user:   { _id: MOCK_USER_ID },
        file:   undefined,
      };
      const res  = mockRes();
      const next = jest.fn();

      await trackController.uploadArtwork(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    test('initiateUpload — returns 201 with trackId and uploadUrl', async () => {
      trackService.generateUploadUrl = jest.fn().mockResolvedValue({
        trackId:   MOCK_TRACK_ID,
        uploadUrl: 'https://azure.example.com/upload?sas=tok',
      });

      const req = {
        user: mockUser,
        body: { title: 'Song', format: 'audio/mpeg', size: 5_000_000, duration: 180 },
      };
      const res = mockRes();

      await trackController.initiateUpload(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    test('getTrack — returns 200 with formatted track', async () => {
      trackService.getTrackByPermalink = jest.fn().mockResolvedValue(mockTrack);

      const req = { params: { permalink: 'my-test-track' } };
      const res = mockRes();

      await trackController.getTrack(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: expect.any(Object) })
      );
    });

    test('deleteTrack — returns 200 on successful deletion', async () => {
      trackService.deleteTrack = jest.fn().mockResolvedValue(true);

      const req = {
        params: { id: MOCK_TRACK_ID },
        user:   { _id: MOCK_USER_ID },
      };
      const res = mockRes();

      await trackController.deleteTrack(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('confirmUpload — returns 200 with processing state', async () => {
      trackService.confirmUpload = jest.fn().mockResolvedValue({
        _id:             MOCK_TRACK_ID,
        permalink:       'my-test-track',
        title:           'My Test Track',
        processingState: 'Processing',
      });

      const req = {
        params: { id: MOCK_TRACK_ID },
        user:   { _id: MOCK_USER_ID },
      };
      const res = mockRes();

      await trackController.confirmUpload(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ── 4.3  uploadMiddleware ──────────────────────────────────
  describe('uploadMiddleware', () => {
    const upload = require('../src/middlewares/uploadMiddleware');

    test('exports a multer instance with .single and .fields methods', () => {
      expect(typeof upload.single).toBe('function');
      expect(typeof upload.fields).toBe('function');
    });
  });
});

// ╔══════════════════════════════════════════════════════════╗
// ║  CROSS-CUTTING — Error Handler & Utilities               ║
// ╚══════════════════════════════════════════════════════════╝

describe('Global Error Handler', () => {
  const AppError          = require('../src/utils/appError');
  const globalErrorHandler = require('../src/middlewares/errorHandler');

  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
  };

  const OLD_ENV = process.env.NODE_ENV;
  afterAll(() => { process.env.NODE_ENV = OLD_ENV; });

  test('sends operational error message in production', () => {
    process.env.NODE_ENV = 'production';
    const err = new AppError('Resource not found', 404);
    const res = mockRes();
    globalErrorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Resource not found' })
    );
  });

  test('sends generic message for non-operational error in production', () => {
    process.env.NODE_ENV = 'production';
    const err = new Error('Some random programming error');
    err.statusCode    = 500;
    err.isOperational = false;
    const res = mockRes();
    globalErrorHandler(err, {}, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Something went wrong. Please try again later.' })
    );
  });

  test('sends full error detail in development mode', () => {
    process.env.NODE_ENV = 'development';
    const err = new AppError('Dev error', 422);
    const res = mockRes();
    globalErrorHandler(err, {}, res, jest.fn());
    const jsonCall = res.json.mock.calls[0][0];
    expect(jsonCall).toHaveProperty('stack');
    expect(jsonCall).toHaveProperty('error');
  });

  test('converts Mongoose CastError to 400 AppError', () => {
    process.env.NODE_ENV = 'production';
    const err = { name: 'CastError', path: '_id', value: 'bad-id', statusCode: 500, isOperational: false };
    const res = mockRes();
    globalErrorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('converts duplicate key error (code 11000) to 400 AppError', () => {
    process.env.NODE_ENV = 'production';
    const err = { code: 11000, keyValue: { email: 'dup@test.com' }, statusCode: 500, isOperational: false };
    const res = mockRes();
    globalErrorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('converts JsonWebTokenError to 401 AppError', () => {
    process.env.NODE_ENV = 'production';
    const err = { name: 'JsonWebTokenError', message: 'invalid sig', statusCode: 500, isOperational: false };
    const res = mockRes();
    globalErrorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('converts TokenExpiredError to 401 AppError', () => {
    process.env.NODE_ENV = 'production';
    const err = { name: 'TokenExpiredError', statusCode: 500, isOperational: false };
    const res = mockRes();
    globalErrorHandler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// ── sendEmail ────────────────────────────────────────────────
jest.mock('nodemailer');

describe('sendEmail utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls nodemailer sendMail with correct options', async () => {
    const nodemailer = require('nodemailer');
    const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'ok' });
    
    nodemailer.createTransport.mockReturnValue({ sendMail: mockSendMail });

    const sendEmail = jest.requireActual('../src/utils/sendEmail');

    await sendEmail({
      email:   'user@test.com',
      subject: 'Test Subject',
      message: 'Hello World',
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to:      'user@test.com',
        subject: 'Test Subject',
      })
    );
  });
});