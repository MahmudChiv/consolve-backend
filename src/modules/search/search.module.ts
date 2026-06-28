/**
 * search.module.ts
 */
import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchParser } from './search.parser';

@Module({
  controllers: [SearchController],
  providers: [SearchService, SearchParser],
  exports: [SearchService],
})
export class SearchModule {}
