import { Module } from "@nestjs/common";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";
import { CrystalBallService } from "./crystal-ball.service";

@Module({
  controllers: [AssetsController],
  providers: [AssetsService, CrystalBallService]
})
export class AssetsModule {}
