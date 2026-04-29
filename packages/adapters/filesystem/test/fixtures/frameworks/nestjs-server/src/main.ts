import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

@Controller()
class AppController {
  @Get()
  readRoot() {
    return "NestJS fixture ready";
  }
}

@Module({
  controllers: [AppController],
})
class AppModule {}

const app = await NestFactory.create(AppModule);
await app.listen(Number(process.env.PORT ?? 3000), "0.0.0.0");
