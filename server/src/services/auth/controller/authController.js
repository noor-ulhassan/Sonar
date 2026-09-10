import { APPLICATION_ROLES } from "../../../shared/constants/roles.js";
import config from "../../../shared/config/index.js";
import ResponseFormatter from "../../../shared/utils/ResponseFormatter.js";
import AppError from "../../../shared/utils/AppError.js";

const authCookieOptions = {
  httpOnly: config.cookie.httpOnly,
  secure: config.cookie.secure,
  sameSite: config.cookie.sameSite,
  maxAge: config.cookie.maxAge,
};

export class AuthController {
  constructor(authService) {
    if (!authService) {
      throw new Error("auth Service is Required");
    }

    this.authService = authService;
  }

  async onboardSuperAdmin(req, res, next) {
    try {
      const { username, email, password } = req.body;
      const superAdminData = {
        username,
        email,
        password,
        role: APPLICATION_ROLES.SUPER_ADMIN,
      };
      const { token, user } =
        await this.authService.onboardSuperAdmin(superAdminData);
      return res
        .cookie("authToken", token, authCookieOptions)
        .status(201)
        .json(
          ResponseFormatter.success(
            user,
            "Super Admin Onboarded Successfully",
            201,
          ),
        );
    } catch (error) {
      next(error);
    }
  }

  async register(req, res, next) {
    try {
      // The bootstrap endpoint is the only path that may create a platform
      // super admin. All users created here belong to a client organization.
      if (req.body.role === APPLICATION_ROLES.SUPER_ADMIN) {
        throw new AppError(
          "Super admin accounts can only be created through onboarding",
          403,
        );
      }

      const { user } = await this.authService.register(req.body);
      return res
        .status(201)
        .json(ResponseFormatter.success(user, "User registered successfully", 201));
    } catch (error) {
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const { username, password } = req.body;
      const { token, user } = await this.authService.login(username, password);

      return res
        .cookie("authToken", token, authCookieOptions)
        .status(200)
        .json(ResponseFormatter.success(user, "Login successful"));
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req, res, next) {
    try {
      const user = await this.authService.getProfile(req.user.userId);
      return res
        .status(200)
        .json(ResponseFormatter.success(user, "Profile fetched successfully"));
    } catch (error) {
      next(error);
    }
  }

  async logout(req, res, next) {
    try {
      const { maxAge, ...clearCookieOptions } = authCookieOptions;
      return res
        .clearCookie("authToken", clearCookieOptions)
        .status(200)
        .json(ResponseFormatter.success(null, "Logout successful"));
    } catch (error) {
      next(error);
    }
  }
}
