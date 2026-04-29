import { Module } from "@nestjs/common";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";
import { CrystalBallPortalService } from "./crystal-ball-portal.service";
import { CrystalBallService } from "./crystal-ball.service";

@Module({
  controllers: [AssetsController],
  providers: [AssetsService, CrystalBallService, CrystalBallPortalService]
})
export class AssetsModule {}
